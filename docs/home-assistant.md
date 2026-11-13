# Backend Butler for Home Assistant

A Home Assistant **custom integration + Lovelace card**. The card runs your LiveKit voice
agent *inside* the HA dashboard and behaves like a native card: **live device tiles you can
tap to control**, plus voice, text chat, a transcript, and the agent's tool-call status.

The voice **worker** — the agent brain (STT / LLM / TTS + Home Assistant MCP) — is
`agent/` in this repo. The integration is the HA-side glue: it mints LiveKit tokens for
logged-in Home Assistant users, proxies the scheduler and the text chat for the card, and
serves the card that runs the voice session in the HA frontend.

## What the card does

- **Native device tiles from `hass.states`** — live status, **tap to toggle**, long-press /
  right-click opens HA's native more-info dialog. Tiles update themselves via `hass`.
- **Voice** — push-to-talk or auto turn detection. STT starts **off** and only spins up for
  an actual turn (then back down when you go idle), so a card idling on a dashboard costs
  nothing beyond the worker connection.
- **Text chat** — always available and needs no STT, so the card works as a pure text chat.
- **Speaker toggle** — turn the agent's spoken (TTS) replies on/off from the header; **off by
  default** (text-only).
- **Transcript** — SDK-managed, so interim speech is replaced by the final text (no dupes).
- **Tool-call status** — a compact line for what the agent is doing.

## Architecture

```
LiveKit worker  (agent/)
  ├─ talks to Home Assistant over MCP  → voice control ("turn on the light")
  └─ streams tool-execution events on the "ha.tool_call" data channel

custom_components/backend_butler/  (thin glue integration)
  ├─ token.py    → POST /api/backend_butler/token: mints a LiveKit token for the
  │                logged-in HA user + explicitly dispatches the worker (agent_name)
  ├─ tasks.py    → /api/backend_butler/tasks|settings|chat…: proxies the scheduler and the
  │                worker's text chat as the logged-in person (settings: admins only)
  ├─ progress.py → POST /api/backend_butler/progress: a turn's progress on a phone
  ├─ media_player.py → a media player for an optional music server
  └─ __init__.py → serves the built card and registers it as a frontend module

card/  (React + @livekit/components-react, bundled with Vite → a single ESM web component)
  ├─ mounts React in a shadow root, given HA's `hass` object
  ├─ device tiles from hass.states: tap = hass.callService, long-press = hass-more-info
  └─ voice / chat / transcript / tool status via @livekit/components-react
```

Two independent control paths that both end at HA and reflect back into the card:
**voice → worker → MCP → HA**, and **tap → card → `hass.callService` → HA**.

## Install (HACS)

1. In HACS, open the **⋮** menu (top right) → **Custom repositories**. Paste
   `https://github.com/taylorsegell/backend-butler-public`, category **Integration**, → **Add**.
2. Find **Backend Butler** in HACS → **Download** → **Restart Home Assistant**.
3. Settings → Devices & Services → **Add Integration** → “Backend Butler”, then:

   | Field | Value |
   |---|---|
   | LiveKit server URL | `wss://your-livekit-host` |
   | LiveKit API key / secret | your LiveKit project credentials |
   | Agent name | `ha-agent` (must match `AGENT_NAME` in the worker's `.env`) |
   | Scheduler URL / token | `http://<docker-host>:8951` and `SCHEDULER_TOKEN` (Schedules tab) |
   | Agent chat URL / token | `http://<docker-host>:8952` and `TEXT_API_TOKEN` (Text tab) |

4. Make sure the **worker** (`docker compose up -d` at the repo root) is running and
   connected to the same LiveKit project.
5. Add the card to a dashboard (Edit dashboard → Add card → “Backend Butler”, or
   in YAML — see options below).
6. Open the dashboard **over HTTPS** and tap **Start voice**.

When a new version is released, HACS offers the update; restart HA and reload the
dashboard to pick up the new card.

## Card options

```yaml
type: custom:backend-butler-card
title: Voice Assistant        # optional header title
input_mode: push_to_talk      # push_to_talk (default) | auto
audio_output: false           # default false: agent replies in text only (toggle in the header)
start_on_connect: false       # default false: stay dormant (no STT) until you tap to talk
auto_connect: false           # default false: stay static until the first send/speak, then connect lazily
height: 720                   # card height in px (default 720; capped to the viewport)
areas:                        # optional: show all entities in these areas as tiles
  - Living Room
  - Master Bedroom
entities:                     # optional: always show these specific entities
  - light.study_spotlight
  - climate.bedroom_ac
follow_agent: true            # default true: also surface tiles for areas the agent looks at
recent_minutes: 60            # default 60: pin devices changed in the last N minutes, whatever changed them (0 = off)
music_entity: media_player.x  # optional: the player the now-playing bar shows (default: this integration's)
```

All fields are optional. **By default the card is text-only and dormant**: it stays static
until you send or speak, then connects with STT and TTS off, so it's free to leave on any
dashboard. Tap the mic to talk — which spins STT up just for that turn and tears it back down once you're idle — or flip
the header speaker to hear replies. Set `audio_output: true` and/or `start_on_connect: true`
to speak and start listening the moment it connects; `input_mode: auto` makes it hands-free.
`areas`/`entities` pin a fixed set of tiles that are always visible (like any native HA card).

With a **Music server URL** set in the integration's options (a [music-mcp-server](https://github.com/taylorsegell/music-mcp-server), which plays Apple Music on a Mac and its AirPlay speakers), the integration adds a `media_player` for it, and the card shows a now-playing bar with play/pause, previous/next, stop and volume while it plays or is paused.

## Why tiles render by `entity_id`/area, not by device name

Matching the worker's spoken device *names* back to entities is unreliable in a typical
setup: registry aliases are often absent, one device name can map to many entities
(multi-gang switches, or climate devices that also expose a `switch`/`light`), and real
`friendly_name`s carry channel suffixes. The card renders from `hass.states` keyed by
`entity_id`, **scoped by area** via HA's own area registry. State stays correct for free:
HA pushes state changes into the card's `hass` object, so tiles update themselves.

## Roadmap

- ✅ Voice (push-to-talk / auto), transcript, agent state.
- ✅ Native device tiles from `hass.states` (tap-to-toggle, more-info), text chat, tool status.
- ⏳ Per-device highlight of exactly what the agent just controlled.
- ⏳ Voice-driven navigation of your existing Lovelace views.

## Caveats

- **Microphone needs a secure context.** Open the dashboard over HTTPS (or `localhost`). A
  LAN-IP `http://…:8123` origin cannot use the mic.
- **Reload requires a restart.** HA has no runtime unregister for HTTP views / static
  paths / frontend modules, so reconfiguring updates the token config live, but fully
  removing the integration needs a restart.

## Manual install (without HACS)

The built card bundle is committed, so no Node toolchain is needed on the HA host — just
copy the integration into your HA config's `custom_components/` and restart:

```bash
rsync -a custom_components/backend_butler/ \
  <user>@<your-ha-host>:/config/custom_components/backend_butler/   # adjust to your config path
```

## Development

Card source is `card/src/` (React + TypeScript). CI rebuilds and commits the bundle on
push to `main`, and cuts a GitHub release on a `v*` tag; to build locally:

```bash
cd card
pnpm install
pnpm build     # → ../custom_components/backend_butler/frontend/backend-butler-card.js
pnpm watch     # rebuild on change
```

Commit the rebuilt bundle so HACS / manual installs serve it directly. The integration
Python is in `custom_components/backend_butler/` (`token.py` = token endpoint, `tasks.py` =
scheduler and chat proxies, `progress.py` = phone progress, `__init__.py` =
setup/registration, `config_flow.py` = setup UI). `pnpm typecheck` checks the card.

## Upgrading from LiveKit Voice Assistant

This integration used to be called LiveKit Voice Assistant (domain `livekit_voice`). Its domain
is now `backend_butler`, so Home Assistant treats it as a new integration. Do the steps in
this order:

1. Back up Home Assistant.
2. Install or update **Backend Butler** (HACS, or copy `custom_components/backend_butler/`).
3. HACS may leave the old folder in place; delete `custom_components/livekit_voice/` if it is still there.
4. Restart Home Assistant.
5. Settings → Devices & Services → **Add Integration** → **Backend Butler** → Submit. The fields
   are pre-filled from the old entry.
6. The music player is a new entity, so its entity_id may change. Update any automations or
   dashboards that name it, or set the old entity_id back in Settings → Entities.
7. Delete the old "LiveKit Voice Assistant" entry (it shows as not loaded). Delete it only after
   step 5, or you lose the pre-fill.
8. On the worker host, run `docker compose up -d --build`. The containers have new names; state
   lives in bind mounts. Between steps 4 and 8 the scheduler's progress posts get a 404, which is harmless.

Dashboards that use `type: custom:livekit-voice-card` keep working (the browser console shows a
warning). Change them to `type: custom:backend-butler-card`.

## Talk directly from a dashboard

Add **Backend Butler Voice** from the card picker, or use:

```yaml
type: custom:backend-butler-voice-card
title: Talk to Butler
height: 380
```

This is an embedded live voice session, not a navigation button. Tap the microphone to
start talking, then Send to finish the recording; Cancel discards it. Replies and the
transcript stay in the card. Spoken replies are enabled by default for this variant;
set `audio_output: false` for text replies. The microphone stays dormant until tapped.
It uses the same authenticated connection and permission/error recovery as full-page
Voice. HTTPS and browser microphone permission are required. Use one Butler session
card per dashboard view; its session is shared with the full-page Butler interface.

The equivalent option on `custom:backend-butler-card` is `layout: voice` (set
`audio_output: true` if you want spoken replies). The full embedded interface remains
available using `layout: card`.

During an active voice session, a compact strip above the composer shows connection,
microphone, backend-work and reply-playback status. Its rings follow actual audio levels;
reduced-motion settings keep the feedback static. Live captions mark transcription in
progress and settle into final text. **Stop reply audio** mutes playback without cancelling
home actions; replies resume with your next recognized utterance, typed/new microphone
turn, or the header audio control. If browser autoplay blocks sound, use **Enable reply
audio**. **End voice session** disconnects and releases the microphone.

The dashboard voice card stays content-sized while empty and idle. Its `height` option
sets the expanded conversation height once a session is active or has transcript content.

The dashboard voice variant uses the House companion layout: Butler’s own mark, a short
invitation while idle, and live session status. The mark follows real microphone/reply
levels, stays still in silence, and respects reduced motion. Theme and accent settings
apply to the mark and controls. Approval requests remain available before any transcript
messages. Existing `custom:backend-butler-voice-card` configurations receive this design
automatically; no YAML changes are required.
