import asyncio
import json
import logging

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse, PlainTextResponse
from livekit import api, rtc
from livekit.agents import (
    AgentServer,
    AgentSession,
    JobContext,
    SessionUsageUpdatedEvent,
    ToolExecutionUpdatedEvent,
    TurnHandlingOptions,
    cli,
    inference,
)
from livekit.agents.metrics import LLMModelUsage

import auth
import mcp_clients
import text_chat.routes
from agent import HomeAssistantAgent
from config import (
    MAX_TOOL_OUTPUT_CHARS,
    SESSION_STATE_TOPIC,
    SUGGESTIONS_TOPIC,
    TOOL_CALL_TOPIC,
    UPDATE_PREFIX,
    settings,
)
from conversations import A2A_ENDPOINT, conversations
from history import render
from utils import build_llm, parse_job_metadata, truncate
from voice_persistence import RemoteSession

logger = logging.getLogger("ha-mcp-agent")


# The HTTP process owns the store, including leased RTC conversations.
server = AgentServer(port=settings.http_port, store=conversations.store)

if settings.text_api_token:
    # these routes act for a person or reveal the setup, so they need a token
    _GUARDED = (f"/{A2A_ENDPOINT}", text_chat.routes.CHAT_PATH, "/mcp")
    _USER_TOKENS = auth.parse_user_tokens(settings.text_user_tokens)

    @server.http.middleware("http")
    async def require_token(request: Request, call_next):
        if request.url.path.startswith(_GUARDED):
            given = request.headers.get("authorization", "").removeprefix("Bearer ")
            caller = auth.check(
                request.url.path, given, request.query_params.get("user"), _USER_TOKENS
            )
            if caller is None:
                return PlainTextResponse("unauthorized", status_code=401)
            request.scope[text_chat.routes.CALLER] = caller
        return await call_next(request)

    # before the text chat's routes: its A2A binding shadows GET routes added after it
    @server.http.get("/mcp/servers")
    async def restricted_servers() -> JSONResponse:
        """The MCP servers a person gets only when their Settings entry lists them."""
        return JSONResponse({"servers": mcp_clients.restricted()})


text_chat.routes.mount(server)


def _forward_tool_events(ctx: JobContext, session: AgentSession) -> None:
    """Stream the tool-execution lifecycle to the frontend over a data channel.

    Each ``tool_execution_updated`` event is serialized and published on
    ``TOOL_CALL_TOPIC``. One consumer preserves ordering, and large outputs are
    clipped to the data-packet size budget (modeled on the upstream async_tool_agent).
    """
    queue: asyncio.Queue[ToolExecutionUpdatedEvent] = asyncio.Queue()

    @session.on("tool_execution_updated")
    def _on_tool_execution_updated(ev: ToolExecutionUpdatedEvent) -> None:
        queue.put_nowait(ev)

    async def _pump() -> None:
        while True:
            ev = await queue.get()
            data = ev.model_dump(mode="json")
            update = data.get("update", {})
            message = update.get("message")
            if isinstance(message, str):
                update["message"] = truncate(message, MAX_TOOL_OUTPUT_CHARS)
            try:
                await ctx.room.local_participant.publish_data(
                    json.dumps(data, ensure_ascii=False),
                    topic=TOOL_CALL_TOPIC,
                    reliable=True,
                )
            except Exception:
                logger.exception("failed to publish tool event")

    task = asyncio.create_task(_pump())

    async def _cancel_pump() -> None:
        task.cancel()

    ctx.add_shutdown_callback(_cancel_pump)


def _forward_butler_events(
    ctx: JobContext, session: AgentSession, person: str | None
) -> None:
    """Callbacks arrive in the HTTP process; voice jobs consume them over loopback."""
    if not person or not settings.text_api_token:
        return

    async def pump() -> None:
        cursor: int | None = None
        async with httpx.AsyncClient(timeout=10) as client:
            while True:
                try:
                    params = {"user": person}
                    if cursor is not None:
                        params["after"] = str(cursor)
                    response = await client.get(
                        f"http://127.0.0.1:{settings.http_port}/chat/approval-events",
                        params=params,
                        headers={"Authorization": f"Bearer {settings.text_api_token}"},
                    )
                    response.raise_for_status()
                    data = response.json()
                    cursor = data["cursor"]
                    for event in data["events"]:
                        # Invalidation only: previews can exceed packet limits.
                        await ctx.room.local_participant.publish_data(
                            "{}", topic="ha.butler_approval", reliable=True
                        )
                        session.generate_reply(
                            user_input=f"{UPDATE_PREFIX} butler: {event['text']}",
                            tool_choice="none",
                        )
                except Exception:
                    logger.warning("Butler voice updates temporarily unavailable")
                await asyncio.sleep(1)

    task = asyncio.create_task(pump())

    async def stop() -> None:
        task.cancel()

    ctx.add_shutdown_callback(stop)


@server.rtc_session(agent_name=settings.agent_name)
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}

    meta = parse_job_metadata(ctx.job.metadata)

    # Detector reused whenever we switch to auto; STT instance held so we can detach it
    # (stt=None) and rewire the same object later via Agent.update_options. The VAD is
    # the session's bundled Silero default and stays live throughout (local, unbilled).
    turn_detector = inference.TurnDetector()
    stt = inference.STT(settings.stt_model, language=settings.stt_language)

    # the integration names the person who asked for this session
    agent = HomeAssistantAgent(user_id=meta.get("user_id") or None)
    session = AgentSession(
        stt=stt,
        llm=build_llm(),
        tts=inference.TTS(
            settings.tts_model, voice=settings.tts_voice, language=settings.tts_language
        ),
        turn_handling=TurnHandlingOptions(turn_detection="manual"),
        max_tool_steps=settings.max_tool_steps,
    )

    try:
        persisted = await RemoteSession.open(agent.user_id, meta.get("conversation_id"))
    except Exception as exc:
        message = "Conversation could not be opened. Reconnect to try again."
        if isinstance(exc, httpx.HTTPStatusError):
            try:
                message = str(exc.response.json().get("detail") or message)
            except ValueError:
                pass
        logger.exception("Could not acquire conversation for voice session")
        error = json.dumps({"error": message, "message": message})

        @ctx.room.local_participant.register_rpc_method("get_conversation")
        async def conversation_error(_data: rtc.RpcInvocationData) -> str:
            return error

        await ctx.connect()
        await ctx.room.local_participant.publish_data(
            error, topic="ha.conversation_error", reliable=True
        )
        # Remain available for get_conversation until the frontend receives the
        # failure and disconnects; never start an unsaved voice conversation.
        return
    await session.start(agent=agent, room=ctx.room, persist=persisted)
    # A seed contains only pre-existing items, never later live transcript updates.
    seed_items = render(list(session.history.items))[0][-100:]
    seed = json.dumps({"id": persisted.session_id, "items": seed_items})
    # LiveKit RPC responses are bounded. Only the visible seed is shortened; the
    # complete stored history remains in the model context and history drawer.
    while len(seed.encode()) > 12000 and seed_items:
        seed_items.pop(0)
        seed = json.dumps({"id": persisted.session_id, "items": seed_items})
    await agent.update_chat_ctx(
        agent.chat_ctx.copy().truncate(max_items=settings.text_max_items)
    )
    await ctx.connect()

    @ctx.room.local_participant.register_rpc_method("get_conversation")
    async def get_conversation(_data: rtc.RpcInvocationData) -> str:
        return seed

    async def publish_conversation() -> None:
        await ctx.room.local_participant.publish_data(
            seed, topic="ha.conversation", reliable=True
        )

    @ctx.room.on("participant_connected")
    def _conversation_connected(_participant: rtc.RemoteParticipant) -> None:
        asyncio.create_task(publish_conversation())

    await publish_conversation()

    # Persist ordered SDK snapshots whenever a turn adds an item. The SDK serializes
    # captures with its persistence lock; one drain coalesces bursts of tool events.
    dirty = asyncio.Event()

    @session.on("conversation_item_added")
    def _save_item(_event: object) -> None:
        dirty.set()

    @session.on("session_usage_updated")
    def _voice_usage(event: SessionUsageUpdatedEvent) -> None:
        llms = [u for u in event.usage.model_usage if isinstance(u, LLMModelUsage)]
        persisted.usage = {
            key: int(persisted.earlier_usage.get(key, 0))
            + sum(getattr(u, field) for u in llms)
            for key, field in {
                "input": "input_tokens",
                "output": "output_tokens",
                "cached": "input_cached_tokens",
            }.items()
        }
        dirty.set()

    async def persistence_failed() -> None:
        try:
            await ctx.room.local_participant.publish_data(
                json.dumps(
                    {
                        "message": (
                            "Conversation could not be saved. "
                            "Reconnect to continue."
                        )
                    }
                ),
                topic="ha.conversation_error",
                reliable=True,
            )
        finally:
            await session.aclose()

    async def save_loop() -> None:
        while True:
            await dirty.wait()
            dirty.clear()
            try:
                await session.save()
            except Exception:
                logger.exception(
                    "Conversation persistence failed; closing the voice session"
                )
                await persistence_failed()
                return

    async def heartbeat_loop() -> None:
        try:
            await persisted.heartbeat()
        except Exception:
            logger.exception("Conversation lease lost; closing the voice session")
            await persistence_failed()

    save_task = asyncio.create_task(save_loop())
    heartbeat_task = asyncio.create_task(heartbeat_loop())

    async def close_conversation() -> None:
        save_task.cancel()
        heartbeat_task.cancel()
        await asyncio.gather(save_task, heartbeat_task, return_exceptions=True)
        # SDK close saves and releases its HTTP adapter, even with no recent items.
        await session.aclose()
        await persisted.release()

    ctx.add_shutdown_callback(close_conversation)

    _forward_tool_events(ctx, session)
    _forward_butler_events(ctx, session, agent.user_id)

    # --- Session state the frontend mirrors, and the controls that mutate it. ---
    #
    # Deliberately simple: STT is billed continuously, so it follows the mic (see
    # _set_audio_input) — live while audio input is on, torn down after STT_IDLE_TIMEOUT
    # once gated. TTS (audio output) and text chat are independent, so the agent can run
    # as pure text with zero speech cost. The card drives it all over RPCs; the agent
    # boots dormant + text-only so an idle card costs only its connection. Same in both
    # manual and auto modes.
    stt_enabled = True  # session boots with STT wired; torn down in the boot below
    audio_output_enabled = True  # session default; muted at boot
    stt_timer: asyncio.TimerHandle | None = None
    publish_queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()

    async def _publish_loop() -> None:
        # One consumer so packets go out in enqueue order (no inter-task races); it
        # carries session-state and quick-reply updates. Cancelled in _on_shutdown.
        while True:
            topic, payload = await publish_queue.get()
            try:
                await ctx.room.local_participant.publish_data(
                    payload, topic=topic, reliable=True
                )
            except Exception:
                logger.exception("failed to publish on %s", topic)

    publish_task = asyncio.create_task(_publish_loop())

    def _publish_state() -> None:
        payload = json.dumps(
            {"stt_enabled": stt_enabled, "audio_output": audio_output_enabled}
        )
        publish_queue.put_nowait((SESSION_STATE_TOPIC, payload))

    def _publish_suggestions(replies: list[str]) -> None:
        publish_queue.put_nowait((SUGGESTIONS_TOPIC, json.dumps({"replies": replies})))

    agent._suggest_replies_cb = _publish_suggestions

    def _cancel_stt_timer() -> None:
        nonlocal stt_timer
        if stt_timer is not None:
            stt_timer.cancel()
            stt_timer = None

    def _enable_stt() -> None:
        nonlocal stt_enabled
        _cancel_stt_timer()
        if stt_enabled:
            return
        agent.update_options(stt=stt)
        stt_enabled = True
        logger.info("STT enabled")
        _publish_state()

    def _disable_stt() -> None:
        nonlocal stt_enabled
        _cancel_stt_timer()
        if not stt_enabled:
            return
        agent.update_options(stt=None)
        stt_enabled = False
        logger.info("STT disabled (mic idle) to save cost")
        _publish_state()

    def _set_audio_input(enabled: bool) -> None:
        """Gate the mic and tie STT to it: enabled while listening, and scheduled for
        teardown STT_IDLE_TIMEOUT after the mic goes quiet (a grace period so quick,
        successive turns don't re-initialise STT)."""
        nonlocal stt_timer
        if enabled:
            _enable_stt()  # before opening the mic so STT is ready for the first words
            session.input.set_audio_enabled(True)
        else:
            session.input.set_audio_enabled(False)
            _cancel_stt_timer()
            if stt_enabled:
                loop = asyncio.get_running_loop()
                stt_timer = loop.call_later(settings.stt_idle_timeout, _disable_stt)

    def _set_audio_output(enabled: bool) -> None:
        """Toggle spoken (TTS) replies. Text replies are unaffected."""
        nonlocal audio_output_enabled
        if enabled == audio_output_enabled:
            return
        session.output.set_audio_enabled(enabled)
        audio_output_enabled = enabled
        logger.info("audio output %s", "enabled" if enabled else "disabled")
        _publish_state()

    async def _set_can_subscribe(identity: str, allow: bool) -> None:
        """Grant/revoke a participant's track-subscribe permission at runtime.

        The card connects with can_subscribe=False so an idle/text connection has no
        receive-audio transceiver (which on iOS grabs the audio session and stops the
        user's music). We allow subscribing only while spoken replies are on.
        """
        if not identity:
            return
        try:
            await ctx.api.room.update_participant(
                api.UpdateParticipantRequest(
                    room=ctx.room.name,
                    identity=identity,
                    permission=api.ParticipantPermission(
                        can_publish=True,
                        can_publish_data=True,
                        can_subscribe=allow,
                    ),
                )
            )
        except Exception:
            logger.exception("failed to update subscribe permission for %s", identity)

    def apply_mode(manual: bool) -> None:
        """Switch turn detection and gate the mic to match. STT follows the mic."""
        session.update_options(turn_detection="manual" if manual else turn_detector)
        if manual:
            session.clear_user_turn()
            _set_audio_input(False)  # idle until start_turn opens a turn
        else:
            _set_audio_input(True)  # auto: mic stays live so the model can detect turns

    # Boot dormant + text-only: mic gated, STT torn down now (no idle wait), TTS muted.
    session.input.set_audio_enabled(False)
    _disable_stt()
    _set_audio_output(False)
    _publish_state()

    @ctx.room.on("participant_connected")
    def _on_participant_connected(_participant: rtc.RemoteParticipant) -> None:
        # Re-assert state so a frontend that joins/reconnects mid-session sees it.
        _publish_state()

    async def _on_shutdown() -> None:
        _cancel_stt_timer()
        publish_task.cancel()

    ctx.add_shutdown_callback(_on_shutdown)

    @ctx.room.local_participant.register_rpc_method("set_turn_mode")
    async def set_turn_mode(data: rtc.RpcInvocationData) -> str:
        manual = data.payload == "manual"
        logger.info("set turn mode: %s", "manual" if manual else "auto")
        apply_mode(manual)
        return "ok"

    @ctx.room.local_participant.register_rpc_method("set_audio_output")
    async def set_audio_output(data: rtc.RpcInvocationData) -> str:
        # payload "on"/"off" toggles spoken (TTS) replies; text replies still work.
        # Grant subscribe before enabling TTS; revoke after disabling it, so the client
        # only holds the audio session while replies play. No reconnect either way.
        on = data.payload == "on"
        if on:
            await _set_can_subscribe(data.caller_identity, True)
        _set_audio_output(on)
        if not on:
            await _set_can_subscribe(data.caller_identity, False)
        return "ok"

    @ctx.room.local_participant.register_rpc_method("start_turn")
    async def start_turn(data: rtc.RpcInvocationData) -> str:
        session.interrupt()
        session.clear_user_turn()
        # listen only to the participant who started the turn (multi-user rooms)
        session.room_io.set_participant(data.caller_identity)
        _set_audio_input(True)  # opens the mic and (re)enables STT
        return "ok"

    @ctx.room.local_participant.register_rpc_method("end_turn")
    async def end_turn(data: rtc.RpcInvocationData) -> str:
        _set_audio_input(False)  # gate the mic; STT tears down after the idle timeout
        session.commit_user_turn()
        return "ok"

    @ctx.room.local_participant.register_rpc_method("cancel_turn")
    async def cancel_turn(data: rtc.RpcInvocationData) -> str:
        _set_audio_input(False)
        session.clear_user_turn()
        logger.info("cancel turn")
        return "ok"


if __name__ == "__main__":
    cli.run_app(server)
