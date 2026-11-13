import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, ParticipantKind, type RemoteParticipant, Room, RoomEvent, Track } from 'livekit-client';
import {
  RoomAudioRenderer,
  SessionProvider,
  useAgent,
  useChat,
  useSession,
  useSessionContext,
} from '@livekit/components-react';
import { Conversation } from './components/Conversation';
import { DeviceTiles } from './components/DeviceTiles';
import { Dock } from './components/Dock';
import { ModeSwitch } from './components/Header';
import { ConversationHeader } from './components/ConversationHeader';
import { ConversationDrawer } from './components/ConversationDrawer';
import { TextHistory } from './components/TextHistory';
import { useRoomDataTopic } from './lib/room-data';
import { httpStatus } from './lib/errors';
import { createConversationReady } from './lib/conversation-ready';
import { VoiceFeedback } from './components/VoiceFeedback';
import { resolveVoiceFeedback, useVoiceAudioLevels } from './lib/voice-feedback';
import { useReplyAudio } from './lib/reply-audio';
import { useVoiceTransport } from './lib/voice-transport';
import { RecoveryNotice } from './components/RecoveryNotice';
import { NowPlaying } from './components/NowPlaying';
import { ScheduledTasks } from './components/ScheduledTasks';
import { SchedulesTab } from './components/SchedulesTab';
import { SettingsTab } from './components/SettingsTab';
import { TaskEditor } from './components/TaskEditor';
import { HassStoreProvider, useCardConfig, useHass, useStore } from './hass/context';
import type { HassStore } from './hass/store';
import { HassTokenSource } from './hass/token-source';
import { type ConvItem, humanizeTool, lastUserText, useConversation } from './lib/conversation';
import { useSessionState } from './lib/session-state';
import { useSuggestions } from './lib/suggestions';
import { useTilesVisible } from './lib/tiles-visible';
import type { Task } from './lib/tasks';
import { useTasks } from './lib/tasks-api';
import { useTextChat } from './lib/text-chat';
import { useToolFeed } from './lib/tool-feed';
import { loadTurnMode, saveTurnMode, type TurnMode } from './lib/turn-mode';

export function Root({ store }: { store: HassStore }) {
  return (
    <HassStoreProvider value={store}>
      <SessionRoot />
    </HassStoreProvider>
  );
}

function SessionRoot() {
  const store = useStore();
  const tokenSource = useMemo(() => new HassTokenSource(store), [store]);
  // Own the Room so we can set stopMicTrackOnMute: muting the mic (ending/cancelling a turn,
  // or pausing in auto mode) then stops the underlying MediaStreamTrack, releasing the device
  // so the browser/OS mic-recording indicator turns off between turns. It's re-acquired when
  // the next turn opens (setMicrophoneEnabled(true)).
  const room = useMemo(() => new Room({ publishDefaults: { stopMicTrackOnMute: true } }), []);
  const session = useSession(tokenSource, { room });
  return (
    <SessionProvider session={session}>
      <CardShell />
    </SessionProvider>
  );
}

const isAgentParticipant = (p: RemoteParticipant): boolean =>
  p.kind === ParticipantKind.AGENT || p.isAgent;

function agentIdentity(room: Room | undefined): string | null {
  if (!room) return null;
  for (const p of room.remoteParticipants.values()) {
    if (isAgentParticipant(p)) return p.identity;
  }
  return null;
}

/** Session + agent state → the header's orb animation and status label. */
const AGENT_PHASES: Record<string, { orb: string; label: string }> = {
  listening: { orb: 'listening', label: 'Listening' },
  thinking: { orb: 'thinking', label: 'Thinking' },
  speaking: { orb: 'speaking', label: 'Speaking' },
  idle: { orb: 'listening', label: 'Connected' },
  initializing: { orb: 'connecting', label: 'Connecting' },
  'pre-connect-buffering': { orb: 'connecting', label: 'Connecting' },
  connecting: { orb: 'connecting', label: 'Connecting' },
  disconnected: { orb: 'connecting', label: 'Connecting' },
  failed: { orb: 'idle', label: 'Offline' },
};

function agentPhase(connected: boolean, connecting: boolean, agentState: string | undefined) {
  if (connecting) return { orb: 'connecting', label: 'Connecting' };
  // Not connected is a normal, ready state now (the card connects lazily on the first
  // send/speak) — not an error. A calm idle orb, distinct from the active connected states.
  if (!connected) return { orb: 'idle', label: 'Ready' };
  return AGENT_PHASES[agentState ?? ''] ?? { orb: 'listening', label: 'Connected' };
}

type Tab = 'chat' | 'text' | 'schedules' | 'settings';
const TABS: readonly Tab[] = ['chat', 'text', 'schedules', 'settings'];

const LEGACY_TITLES = new Set(['home voice', 'voice assistant', 'livekit voice']);

function resolveCardTitle(configured?: string): string {
  const trimmed = configured?.trim();
  if (!trimmed || LEGACY_TITLES.has(trimmed.toLowerCase())) return 'Backend Butler';
  return trimmed;
}

function linkedTab(): Tab | null {
  const value = new URLSearchParams(window.location.search).get('lk_tab');
  return TABS.includes(value as Tab) ? (value as Tab) : null;
}

function CardShell() {
  const store = useStore();
  const hass = useHass();
  const config = useCardConfig();
  const session = useSessionContext();
  const agent = useAgent();
  const agentState = agent.state;
  const { sttEnabled, audioOutput } = useSessionState();
  const { suggestions, clear: clearSuggestions } = useSuggestions();
  const { toolCalls, agentAreas } = useToolFeed();
  type Drawer = 'settings' | 'schedules' | 'history' | null;
  const initialLink = linkedTab();
  const [drawer, setDrawer] = useState<Drawer>(() => initialLink === 'settings' ? 'settings' : initialLink === 'schedules' ? 'schedules' : initialLink === 'text' ? 'history' : null);
  const voiceCard = config.layout === 'voice';
  const setTab = (destination: Tab) => setDrawer(destination === 'settings' ? 'settings' : destination === 'schedules' ? 'schedules' : destination === 'text' ? 'history' : null);
  const [settingsVisited, setSettingsVisited] = useState(initialLink === 'settings');
  const [historyVisited, setHistoryVisited] = useState(initialLink === 'text');
  useEffect(() => { if (drawer === 'settings') setSettingsVisited(true); if (drawer === 'history') setHistoryVisited(true); }, [drawer]);
  const [historySeed, setHistorySeed] = useState<ConvItem[]>([]);
  const [historyOpening, setHistoryOpening] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  const voiceSendInFlight = useRef(false);
  const [voiceDraft, setVoiceDraft] = useState('');
  const [tilesVisible, toggleTiles] = useTilesVisible();
  const textChat = useTextChat(false);
  // the text conversation schedules tasks too, so its calls refresh the list as well
  const allToolCalls = useMemo(
    () => [...toolCalls, ...textChat.toolCalls],
    [toolCalls, textChat.toolCalls],
  );
  const tasksApi = useTasks(allToolCalls);
  const [epoch, setEpoch] = useState(0);

  // Existing phone links open the matching conversation drawer.
  // HA fires `location-changed` when it navigates, and the card outlives view switches.
  useEffect(() => {
    const onLocation = () => {
      const linked = linkedTab();
      if (linked) setTab(linked);
    };
    window.addEventListener('location-changed', onLocation);
    return () => window.removeEventListener('location-changed', onLocation);
  }, []);
  const [editing, setEditing] = useState<Task | null>(null);
  const openConnectionSettings = () => {
    window.history.pushState({ from: window.location.pathname + window.location.search }, '', '/config/integrations/integration/backend_butler');
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false }, bubbles: true, composed: true }));
  };

  // Ref so effects/handlers always see the live session without re-subscribing.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const connected = session.isConnected;
  const localIdentity = session.room?.localParticipant?.identity;
  const { items, addTyped } = useConversation(localIdentity, toolCalls, epoch, historySeed);
  const { send } = useChat();

  // Card-configured defaults. auto_connect defaults OFF: opening the card is static (chat UI,
  // no room connection) and it connects lazily on the first send/speak — so merely opening or
  // switching to the dashboard never touches the audio session or the user's music.
  const autoConnect = config.auto_connect === true;
  const audioOutputConfig = config.audio_output === true;
  const startOnConnect = config.start_on_connect === true;

  // --- turn mode (auto vs manual), persisted ---
  const [mode, setMode] = useState<TurnMode>(() => loadTurnMode(config));
  const [turnActive, setTurnActive] = useState(false); // manual: a turn is open (recording)
  // auto: mic NOT live (either never started this session, or paused). Starts true — even in
  // auto/continuous mode the mic only goes live once the user taps to talk, so a connected-for-
  // text card never captures audio.
  const [autoPaused, setAutoPaused] = useState(() => loadTurnMode(config) === 'auto');
  const [micStarting, setMicStarting] = useState(false); // mic acquisition in flight (cold-start)
  const [connecting, setConnecting] = useState(false);
  // Keep the failed operation visible with recovery actions until the next attempt
  const [failure, setFailure] = useState<'connection' | 'message' | 'microphone' | null>(null);
  const voiceGeneration = useRef(0);
  const lastUserUtterance = [...items].reverse().find(item => item.kind === 'message' && item.role === 'user');
  const replyAudio = useReplyAudio(lastUserUtterance?.id);
  const replyMuted = replyAudio.muted;
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const transport = useVoiceTransport(session.room!);
  const levels = useVoiceAudioLevels(session.room!, connected, transport.micActive && sttEnabled, audioOutput && !replyMuted);
  const didAutoStart = useRef(false); // kiosk: auto-open the first turn once per mount

  const setMic = useCallback(
    (on: boolean) => sessionRef.current.room?.localParticipant?.setMicrophoneEnabled(on),
    [],
  );

  // Fully release the mic (unpublish + stop the device), not just mute. Muting keeps the audio
  // transceiver on the connection; on iOS a lingering audio transceiver flips the shared session
  // into playAndRecord and interrupts background music. Unpublishing removes it, so no audio
  // session is held between turns. The next turn re-publishes fresh.
  const releaseMic = useCallback(async () => {
    const lp = sessionRef.current.room?.localParticipant;
    const pub = lp?.getTrackPublication(Track.Source.Microphone);
    if (lp && pub?.track) {
      try {
        await lp.unpublishTrack(pub.track, true);
      } catch (e) {
        console.error('releaseMic failed', e);
      }
    }
  }, []);

  const rpc = useCallback(async (method: string, payload = '') => {
    const room = sessionRef.current.room;
    const id = agentIdentity(room);
    if (!room || !id) return;
    try {
      return await room.localParticipant.performRpc({ destinationIdentity: id, method, payload });
    } catch (e) {
      console.error(`${method} failed`, e);
    }
  }, []);

  const conversationReady = useRef<ReturnType<typeof createConversationReady> | null>(null);
  const onConversationError = useCallback((data: unknown) => {
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message : 'Conversation could not be saved. Reconnect to continue.';
    conversationReady.current?.settle(false);
    conversationReady.current = null;
    voiceGeneration.current++;
    setNavigationError(message);
    setFailure('connection');
    setTurnActive(false);
    setAutoPaused(true);
    void releaseMic().then(() => sessionRef.current.end?.()).catch(console.error);
  }, [releaseMic]);
  useRoomDataTopic(session.room, 'ha.conversation_error', onConversationError);

  const applyConversationSeed = useCallback((data: unknown) => {
    if (!data || typeof data !== 'object') return;
    if ('error' in data) { onConversationError(data); return; }
    const seed = data as { id?: unknown; items?: unknown };
    if (typeof seed.id !== 'string' || !Array.isArray(seed.items)) return;
    conversationReady.current?.settle(true);
    store.voiceConversationId = seed.id;
    setHistorySeed((seed.items as (ConvItem & { call_id?: string; output_chars?: number })[])
      .filter(item => item && (item.kind === 'message' || item.kind === 'action') && typeof item.id === 'string' && typeof item.ts === 'number')
      .map(item => item.kind === 'action' ? { ...item, id: item.call_id ?? item.id, outputChars: item.output_chars } : item));
  }, [store, onConversationError]);
  useRoomDataTopic(session.room, 'ha.conversation', applyConversationSeed);
  const changeMode = useCallback((next: TurnMode) => {
    setMode((prev) => {
      if (prev !== next) saveTurnMode(next);
      return next;
    });
  }, []);

  const enableReplyAudio = () => {
    setPlaybackError(null);
    replyAudio.restore();
    void session.room!.startAudio().catch(() => setPlaybackError('Audio could not start. Check this browser’s sound permission, then try Enable reply audio again.'));
  };
  const toggleAudioOutput = () => {
    if (audioOutput && !transport.canPlayback) { enableReplyAudio(); return; }
    if (replyMuted) { replyAudio.restore(); if (audioOutput) return; }
    rpc('set_audio_output', audioOutput ? 'off' : 'on');
  };

  // Connect to the room WITHOUT acquiring any audio (mic off, autoSubscribe off). Resolves once
  // connected (and the agent has joined). Called lazily on the first send/speak, or on open when
  // auto_connect is set. A no-op if already connected.
  // Resolves false when it could not connect, which the header then says. Two taps while
  // connecting share one attempt rather than starting the session twice.
  const connecting$ = useRef<Promise<boolean> | null>(null);
  const connectSession = useCallback(async (): Promise<boolean> => {
    const s = sessionRef.current;
    if (connecting$.current) return connecting$.current;
    if (s.isConnected && conversationReady.current?.state === true) return true;
    conversationReady.current?.settle(false);
    const readiness = createConversationReady();
    conversationReady.current = readiness;
    const generation = voiceGeneration.current;
    setConnecting(true);
    setFailure(null);
    setEpoch((e) => e + 1); // a fresh connection starts a fresh conversation
    connecting$.current = (async () => {
      try {
        if (!s.isConnected) await s.start?.({
          tracks: { microphone: { enabled: false } },
          roomConnectOptions: { autoSubscribe: false },
        });
        if (generation !== voiceGeneration.current) { readiness.settle(false); await s.end?.(); return false; }
        if (!(await readiness.promise) || generation !== voiceGeneration.current) {
          if (generation === voiceGeneration.current) setFailure('connection');
          await s.end?.();
          return false;
        }
        return true;
      } catch (e) {
        readiness.settle(false);
        if (generation !== voiceGeneration.current) return false;
        console.error('connect failed', e);
        setConnecting(false);
        setFailure('connection');
        return false;
      } finally {
        setConnecting(false);
        connecting$.current = null;
      }
    })();
    return connecting$.current;
  }, []);


  // Open the mic + start a turn — connecting first if needed. The FIRST mic acquisition on iOS
  // is slow (getUserMedia + the AVAudioSession switch, which is also what interrupts other apps'
  // audio, so it can't be pre-warmed). Callers flag `micStarting` so the tap shows "Starting…"
  // instead of feeling stuck, and so the user doesn't talk into a not-yet-live mic.
  const openTurn = useCallback(async () => {
    const generation = voiceGeneration.current;
    const ready = await connectSession();
    if (generation !== voiceGeneration.current) throw new DOMException('Voice session ended', 'AbortError');
    if (!ready) throw new Error('not connected');
    await setMic(true);
    if (generation !== voiceGeneration.current) { await releaseMic(); throw new DOMException('Voice session ended', 'AbortError'); }
    await rpc('start_turn');
  }, [connectSession, setMic, rpc, releaseMic]);

  // Open the mic + start a turn, flagging `micStarting` for the cold-start UI and rolling back
  // via `onFail` if the mic never comes up. Shared by push-to-talk and auto-mode resume.
  const beginTurn = useCallback(
    (onFail: () => void) => {
      replyAudio.restore();
      setPlaybackError(null);
      clearSuggestions(); // answering by voice — drop any quick replies
      setFailure(null);
      setMicStarting(true);
      openTurn()
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          console.error('open turn failed', e);
          setFailure((current) => current ?? 'microphone');
          onFail();
        })
        .finally(() => setMicStarting(false));
    },
    [openTurn, clearSuggestions],
  );

  // Close the mic side of a turn: clear `micStarting`, tell the agent (commit or discard), and
  // release the mic device. Shared by End / Cancel / Pause.
  const stopTurn = useCallback(
    async (method: 'end_turn' | 'cancel_turn') => {
      if (method === 'cancel_turn') voiceGeneration.current++;
      setMicStarting(false);
      await rpc(method);
      await releaseMic();
    },
    [rpc, releaseMic],
  );

  // --- manual turn control ---
  const onTurnStart = useCallback(() => {
    setTurnActive(true); // show the listening bar immediately
    beginTurn(() => setTurnActive(false));
  }, [beginTurn]);

  const onTurnEnd = useCallback(async () => {
    setTurnActive(false);
    await stopTurn('end_turn'); // commit — the agent replies
  }, [stopTurn]);

  const onTurnCancel = useCallback(async () => {
    setTurnActive(false);
    await stopTurn('cancel_turn'); // discard
  }, [stopTurn]);

  // --- auto mode: start / pause continuous listening. Same RPCs so the agent actually stops
  // listening rather than just muting the client mic. ---
  const onPause = useCallback(async () => {
    setAutoPaused(true);
    await stopTurn('cancel_turn');
  }, [stopTurn]);

  const onResume = useCallback(() => {
    setAutoPaused(false); // go live immediately
    beginTurn(() => setAutoPaused(true));
  }, [beginTurn]);

  // Send a text message. Connects first if needed — but NEVER acquires audio (no mic, and
  // autoSubscribe/audio-output stay off), so texting leaves background music playing.
  const onSend = useCallback(
    async (text: string) => {
      if (voiceSendInFlight.current) return false;
      voiceSendInFlight.current = true;
      setSendingVoice(true);
      replyAudio.restore();
      setPlaybackError(null);
      clearSuggestions();
      setFailure(null);
      try {
        if (!(await connectSession())) return false;
        await send(text);
        addTyped(text);
        return true;
      } catch (e) {
        console.error('send failed', e);
        setFailure('message');
        return false;
      } finally {
        voiceSendInFlight.current = false;
        setSendingVoice(false);
      }
    },
    [connectSession, addTyped, send, clearSuggestions],
  );

  const retryVoice = async () => {
    const message = voiceDraft.trim();
    if (message) {
      if (await onSend(message)) setVoiceDraft((current) => current.trim() === message ? '' : current);
    } else if (failure === 'microphone') {
      if (mode === 'manual') onTurnStart();
      else onResume();
    } else {
      await connectSession();
    }
  };

  // Idle baseline whenever the card is NOT connected (static/offline). Deliberately does NOT
  // reset on connect — a connect is usually triggered by a speak tap, whose turn must survive.
  useEffect(() => {
    if (connected) return;
    setTurnActive(false);
    setMicStarting(false);
    setAutoPaused(mode === 'auto');
  }, [connected, mode]);

  // Mode flip: reset to the new mode's resting state, release any live mic, and tell the agent.
  // The mic is never enabled here — only an explicit speak/resume opens it — so this can't start
  // recording on its own.
  useEffect(() => {
    voiceGeneration.current++;
    setTurnActive(false);
    setMicStarting(false);
    setAutoPaused(mode === 'auto');
    if (sessionRef.current.isConnected) {
      void releaseMic();
      void rpc('set_turn_mode', mode);
    }
  }, [mode, releaseMic, rpc]);

  // Once connected + agent ready: assert the mode and audio-output default. Auto-open a turn
  // only for a kiosk that BOTH auto-connects and opts into start_on_connect — never for a
  // lazily text-connected card, which must stay audio-free.
  const agentReady = agent.isConnected;
  useEffect(() => {
    if (!connected || !agentReady) return;
    let cancelled = false;
    (async () => {
      const seed = await rpc('get_conversation');
      if (!cancelled && seed) {
        try {
          const data = JSON.parse(seed);
          applyConversationSeed(data);
          if (data?.error) return;
        } catch { /* Live messages remain available if the seed is malformed. */ }
      }
      if (cancelled) return;
      await rpc('set_turn_mode', mode);
      await rpc('set_audio_output', audioOutputConfig ? 'on' : 'off');
      if (cancelled) return;
      if (autoConnect && startOnConnect && !didAutoStart.current) {
        didAutoStart.current = true;
        if (mode === 'auto') onResume();
        else onTurnStart();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, agentReady, mode, autoConnect, startOnConnect, audioOutputConfig, rpc, applyConversationSeed, onTurnStart, onResume]);

  // Subscribe to the agent's audio track only while spoken replies are on (we connect with
  // autoSubscribe:false). With no subscribed remote audio track there's nothing for iOS to
  // activate, so a text-only card never grabs the playback session. Turning audio output on
  // subscribes (the header toggle tap is a user gesture, unlocking iOS autoplay); off releases.
  useEffect(() => {
    const room = sessionRef.current.room;
    if (!connected || !room) return;

    const syncAgentAudio = () => {
      for (const p of room.remoteParticipants.values()) {
        if (!isAgentParticipant(p)) continue;
        for (const pub of p.audioTrackPublications.values()) pub.setSubscribed(audioOutput);
      }
    };

    syncAgentAudio();
    if (!audioOutput) return; // off: unsubscribed above, nothing to keep in sync

    room.on(RoomEvent.TrackPublished, syncAgentAudio);
    room.on(RoomEvent.ParticipantConnected, syncAgentAudio);
    return () => {
      room.off(RoomEvent.TrackPublished, syncAgentAudio);
      room.off(RoomEvent.ParticipantConnected, syncAgentAudio);
    };
  }, [connected, audioOutput]);

  // --- connection lifecycle ---
  // Connect on open only when auto_connect is set; otherwise the card stays static until the
  // first send/speak. The connection is media-free (no mic/subscribe until a turn), so it's
  // cheap to keep alive: we deliberately do NOT tear it down on background / tab-visibility
  // changes, on switching between our Chat/Schedules tabs, or on lovelace-view switches —
  // returning shows the same state, with no refresh. We only release it when the page is
  // actually unloaded (pagehide) or the card is removed (unmount).
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (!autoConnect || autoTried || !hass || connected || document.hidden) return;
    setAutoTried(true);
    void connectSession();
  }, [autoConnect, autoTried, hass, connected, connectSession]);

  useEffect(() => {
    const onPageHide = () => { conversationReady.current?.settle(false); sessionRef.current.end?.(); };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      conversationReady.current?.settle(false);
      sessionRef.current.end?.(); // card removed (view left / dashboard closed)
    };
  }, []);

  const query = lastUserText(items);
  const phase = agentPhase(connected, connecting, agentState);
  // The agent's own "listening" phase just means idle/ready — misleading when STT is off
  // (it isn't hearing anything). Show a ready state when STT is off; Thinking/Speaking
  // still give feedback for a typed reply, and "Listening"
  // only ever appears when STT is genuinely live.
  const dozing = connected && !sttEnabled && phase.orb === 'listening';
  const orbState = dozing ? 'dozing' : phase.orb;
  const voiceError = failure === 'connection'
    ? { title: 'Voice session couldn’t connect', message: 'Your typed draft is still here. Retry the conversation or check connection settings.' }
    : failure === 'message'
      ? { title: 'Your message wasn’t sent', message: 'Your draft is saved below. Retry the message or check connection settings.' }
      : failure === 'microphone'
        ? { title: 'Microphone is unavailable', message: 'Allow microphone access for Home Assistant, then retry. You can still type a message.' }
        : null;

  // Embedded-card mode keeps its existing height behavior. Full-page sizing is owned by
  // the host and fills the available viewport for every tab.
  const endVoice = async () => {
    conversationReady.current?.settle(false);
    conversationReady.current = null;
    voiceGeneration.current++;
    setConnecting(false);
    setPlaybackError(null);
    setTurnActive(false);
    setAutoPaused(true);
    setFailure(null);
    await releaseMic();
    try { if (session.room!.state !== ConnectionState.Disconnected) await session.end?.(); } catch { if (!connecting) setFailure('connection'); }
    replyAudio.restore();
    requestAnimationFrame(() => store.host?.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Start talking"], [aria-label="Start listening"]')?.focus());
  };
  const stopReplyAudio = () => {
    replyAudio.stop();
    requestAnimationFrame(() => store.host?.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
  };
  const pendingVoiceTool = [...toolCalls].reverse().find(tool => tool.status === 'running');
  const feedback = resolveVoiceFeedback({ connected, connecting,
    reconnecting: transport.reconnecting, micActive: transport.micActive && sttEnabled,
    micStarting, agentState, audioOutput: audioOutput && !replyMuted && transport.canPlayback,
    pendingTool: pendingVoiceTool ? humanizeTool(pendingVoiceTool.name) : undefined,
    error: playbackError ?? voiceError?.message ?? null });
  const feedbackVisible = connected || connecting || micStarting || transport.reconnecting || Boolean(failure);

  const voiceFeedback = <VoiceFeedback {...feedback} {...levels}
    onInterrupt={audioOutput && !replyMuted ? stopReplyAudio : undefined}
    onEnableAudio={connected && audioOutput && !transport.canPlayback ? enableReplyAudio : undefined}
    onEnd={feedbackVisible ? () => void endVoice() : undefined} />;

  const tall = true;

  const activeView = (
    <>
      {voiceCard && feedbackVisible && voiceFeedback}
      {/* Keep the transcript visible if the voice connection drops. */}
      <Conversation voice compact={voiceCard} before={voiceCard ? undefined : <div className="lk-context" role="region" aria-label="Home controls">
        <NowPlaying />
        <DeviceTiles
          hidden={!tilesVisible}
          agentAreas={agentAreas}
          toolCalls={toolCalls}
          query={query}
          showRecent={connected}
        />
        <ScheduledTasks
          tasks={tasksApi.tasks}
          freshId={tasksApi.freshId}
          onOpen={setEditing}
          onSeeAll={() => setTab('schedules')}
        />
      </div>} approvals approvalRoom={session.room} items={items} reflowKey={suggestions.length} unavailable={Boolean(failure)}
        notice={voiceError && <RecoveryNotice {...voiceError} retryLabel={voiceDraft.trim() ? 'Retry message' : failure === 'microphone' ? 'Retry microphone' : 'Retry connection'}
          busy={connecting || sendingVoice || micStarting} onRetry={() => void retryVoice()}
          onSettings={hass?.user?.is_admin ? openConnectionSettings : undefined} />}
        onPrompt={(prompt) => {
          setVoiceDraft(prompt);
          requestAnimationFrame(() => store.host?.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
        }} />
      {!voiceCard && feedbackVisible && voiceFeedback}
      <Dock
        draft={voiceDraft}
        onDraftChange={setVoiceDraft}
        connected={connected}
        connecting={connecting}
        mode={mode}
        turnActive={turnActive}
        autoPaused={autoPaused}
        micStarting={micStarting}
        onSend={onSend}
        onTurnStart={onTurnStart}
        onTurnEnd={onTurnEnd}
        onTurnCancel={onTurnCancel}
        onPause={onPause}
        onResume={onResume}
        suggestions={suggestions}
      />
    </>
  );

  const resumeConversation = async (id: string, previousItems: ConvItem[]) => {
    setHistoryOpening(true);
    setNavigationError(null);
    try {
      await endVoice();
      let switched = false;
      for (let attempt = 0; attempt < 4 && !switched; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 350));
        switched = await textChat.switchConversation(id, previousItems);
      }
      if (!switched) throw new Error('This conversation is still in use. Wait a moment, then try again.');
      store.voiceConversationId = id;
      setEpoch(value => value + 1);
      setHistorySeed(previousItems);
      if (!(await connectSession())) throw new Error('The conversation could not connect. Your history is still available.');
      setDrawer(null);
    } finally { setHistoryOpening(false); }
  };
  const newConversation = async () => {
    if (historyOpening) return;
    setHistoryOpening(true);
    setNavigationError(null);
    try {
      await endVoice();
      for (let attempt = 0; ; attempt++) {
        try {
          await store.getSnapshot().hass!.callApi('POST', 'backend_butler/chat', {new: true});
          break;
        } catch (error) {
          if (httpStatus(error) !== 409 || attempt >= 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 350));
        }
      }
      store.voiceConversationId = null;
      setHistorySeed([]);
      setEpoch(value => value + 1);
      setDrawer(null);
      setVoiceDraft('');
    } catch (error) { setNavigationError(error instanceof Error ? error.message : 'Could not start a new conversation. Try again.'); }
    finally { setHistoryOpening(false); }
  };

  return (
    <ha-card data-dock={mode} data-tall={tall ? '1' : '0'} data-voice-card={voiceCard ? '1' : '0'} data-voice-idle={voiceCard && !feedbackVisible && items.length === 0 ? '1' : '0'}>
      {/* Only attach/play the agent's audio once spoken replies are on. Mounting the renderer
          plays remote audio through an <audio> element, which on iOS flips the shared session to
          playback — so a text-only card (audioOutput defaults off) must never mount it. */}
      {audioOutput && <RoomAudioRenderer muted={replyMuted} />}
      <ConversationHeader title={resolveCardTitle(config.title)} connected={connected}
        orbState={feedbackVisible ? feedback.phase : orbState}
        stateLabel={feedbackVisible ? feedback.label : connected ? 'Connected' : 'Ready to talk'} announceState={!feedbackVisible}
        upcomingCount={tasksApi.tasks.filter(task => task.enabled && task.status === 'scheduled').length}
        onHistory={() => setDrawer('history')} onSettings={() => setDrawer('settings')} onUpcoming={() => setDrawer('schedules')} />
      <div className="lk-panel" role="region" aria-label="Conversation">{navigationError && drawer !== 'history' && <p className="lk-set-err" role="alert">{navigationError}</p>}{activeView}</div>
      <ConversationDrawer open={drawer === 'settings'} title="Settings" onClose={() => setDrawer(null)}>
        {settingsVisited && <SettingsTab voicePreferences={<section className="lk-set-sec lk-voice-preferences">
          <h2 className="lk-set-title">Voice preferences</h2>
          <p className="lk-set-desc">Choose how to talk. The microphone starts only when you ask it to.</p>
          <ModeSwitch mode={mode} onChange={changeMode} />
          <button className="lk-checkrow" aria-pressed={tilesVisible} onClick={toggleTiles}>Show device controls · {tilesVisible ? 'On' : 'Off'}</button>
          <button className="lk-checkrow" disabled={!connected} aria-pressed={audioOutput && !replyMuted} onClick={toggleAudioOutput}>Spoken replies · {audioOutput && !replyMuted ? 'On' : 'Off'}</button>
          {!connected && <p className="lk-set-desc">Start a conversation to adjust reply audio.</p>}
        </section>} />}
      </ConversationDrawer>
      <ConversationDrawer open={drawer === 'schedules'} title="Upcoming" onClose={() => setDrawer(null)}>
        <SchedulesTab api={tasksApi} onOpen={setEditing} onCreate={() => { setVoiceDraft(current => current.trim() ? current : 'Remind me to take out the bins tomorrow at 7 PM.'); setDrawer(null); requestAnimationFrame(() => store.host?.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea')?.focus()); }} />
      </ConversationDrawer>
      <ConversationDrawer open={drawer === 'history'} title="Conversations" onClose={() => setDrawer(null)}>
        <div className="lk-history-actions"><button className="lk-btn" onClick={() => void newConversation()} disabled={historyOpening}>New conversation</button>{navigationError && <p className="lk-set-err" role="alert">{navigationError}</p>}</div>
        {historyVisited && <TextHistory active={drawer === 'history'} api={textChat} onClose={() => setDrawer(null)} onContinue={resumeConversation} />}
      </ConversationDrawer>

      {editing && (
        <TaskEditor
          task={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => tasksApi.save(editing.id, patch)}
          onDelete={() => tasksApi.remove(editing.id)}
        />
      )}
    </ha-card>
  );
}
