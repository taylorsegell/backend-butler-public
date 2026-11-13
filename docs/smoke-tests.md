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

## Candidate live-session gate

Real LiveKit voice input/output, mute/stop, reconnect, worker restart, cross-user persistence, and scheduler-outage/recovery must be verified against the isolated candidate stack. Use synthetic speech and test users, unique worker dispatch name, isolated state and random client tokens. Do not stop household services, perform device actions, publish raw transcripts or copy production state. Remove the temporary stack and credentials afterward.

Physical microphone/speaker behavior in the HA mobile app still requires a person on the target device. Programmatic audio tests can verify the transport/inference path but do not certify phone permissions or acoustic quality.
