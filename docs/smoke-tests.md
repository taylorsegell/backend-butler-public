# Public beta smoke tests

Run the portable read-only HA checks with your own dedicated token file:

```sh
cd backend_butler
HA_SMOKE=1 HA_URL=https://your-home-assistant.example.com HA_TOKEN_FILE=/path/to/ha-token npm run test:live
```

The suite reads states and registries and submits valid/invalid configuration to HA's validator. It does not install configuration or call device actions. It is skipped unless explicitly enabled and does not assert private entity names, rooms or inventory sizes.

## Recorded evidence

- All three read-only checks pass against a running Home Assistant instance.
- The candidate worker and scheduler Docker images build from allowlisted, secret-scanned source contexts on a separate worker host.
- The worker has 40 passing tests, including owner-bound leases, expiry, voice/text exclusion, service-only persistence, recovery and the patched OpenTelemetry parser/SDK.
- The scheduler has 24 passing tests; the separate app has 382 unit tests; the card passes typecheck/build, unit checks and Chromium responsive voice controls/reduced-motion tests.

## Recovery checks completed without production credentials

- A real saved conversation was closed, backed up, removed from its original location, and restored in a fresh Python process. History, usage totals and ownership survived; foreign ownership and stale process leases were rejected.
- An isolated scheduler container with networking disabled accepted a synthetic future task, rejected unauthenticated and cross-owner requests, preserved the task across a stop/start outage, and restored it in a replacement container from a closed-state backup. The disposable task and temporary container/data were removed afterward.
- The portable three-test read-only HA suite was rerun successfully. It reads states and registries and validates configuration without installing changes or calling device actions.

These checks cover storage and scheduler recovery. They do not verify LiveKit transport, real speech or a physical mobile microphone.

## Live candidate results — 2026-11-13

The isolated candidate stack used synthetic users/state, its own worker dispatch name and temporary credentials on the same trusted worker host. Extra MCP servers were disabled; test prompts performed no tool/device actions.

- Invalid client tokens and cross-person conversation access were rejected.
- Real RTC dispatch, text delivery, persisted model replies, manual microphone controls, cancel, and reply-audio toggles passed.
- Synthesized microphone audio passed through real LiveKit STT, the configured model and TTS; non-silent reply audio arrived over RTC.
- A new RTC session restored the saved context, and the model recalled the synthetic phrase.
- A full candidate-worker restart preserved history and ownership; a new RTC/model session resumed it successfully.
- With the isolated scheduler stopped, stored history and core RTC/model conversations remained available. The scheduler was then restarted.
- Temporary containers, network, synthetic state and credential copies were removed. Household worker/scheduler services stayed on their original images.
- The maintainer confirmed mobile microphone, captions, spoken reply, mute/stop and reconnect behavior on the existing HA deployment. Its served card bundle differs from this candidate; an exact-candidate installation/phone check remains the final device gate.

Physical phone permissions and acoustic behavior cannot be certified by synthetic audio or browser fixtures. Before publishing the beta release, repeat the mobile check against the installed candidate bundle.
