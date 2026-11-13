# Public beta

Backend Butler is preparing for an early, self-hosted public beta. The public repository uses a curated snapshot with fresh history; the development repository remains private. A release candidate is not a security certification or a promise of stable storage/API compatibility.

## Install the voice-first stack

1. Read the root [README](../README.md) prerequisites. Enable Home Assistant's MCP Server integration, choose exposed entities, and create a dedicated access token.
2. Copy `.env.example` to `.env`, fill in your own Home Assistant and LiveKit credentials, and set unique scheduler/text service tokens. Keep the worker and scheduler on a trusted network. LiveKit Inference/model use can incur charges.
3. Follow the README's Docker Compose setup to run the worker and scheduler. Install the custom integration/card using [the Home Assistant guide](home-assistant.md). Once the repo is public and a beta exists, add this repo as a HACS **Integration** custom repository and enable pre-release versions to select the beta tag. HACS store inclusion is a separate process.
4. Configure the integration with the same LiveKit project and worker name. Configure people and their permissions. Open the card over HTTPS, allow the microphone, and try a harmless device query before enabling write tools.
5. Verify voice → text → history/reconnect on the same conversation, reply mute/stop, dictation, and a disposable schedule. Check a second HA user cannot read or resume the first user's conversations.

The separate Agent SDK HA app in `backend_butler/` is a different installation and model/auth path; see [its docs](butler-app/README.md). Installing the HACS integration does not install that app or the worker.

## Known limitations

- The LiveKit worker uses draft persistence APIs pinned to upstream Git commits and carries a build-time patch. Upstream availability is required for fresh builds. Back up `agent-data/` before upgrading; saved state is not a stable interchange format.
- Automated UI fixtures do not replace testing inside a real Home Assistant instance. Actual microphone permissions, LiveKit reconnects, paid inference, multiple users, and real devices need a release smoke test.
- The separate app currently emits a frontend chunk-size warning. Build succeeds; low-power-client performance has not been certified.
- Promo captures use synthetic data and are not evidence of a live integration test.

## OpenTelemetry security fix

The worker pins the API, SDK, and OTLP exporter family to patched OpenTelemetry 1.45.x through a narrow uv override, while retaining the LiveKit persistence Git pin. [GHSA-xcq7-p3pf-p88h](https://github.com/open-telemetry/opentelemetry-python/security/advisories/GHSA-xcq7-p3pf-p88h) is fixed by 1.45.1 and later; the lockfile resolves 1.45.2. Regression tests cover long malformed whitespace headers, oversized trace state, valid propagation, SDK span export, and LiveKit telemetry imports. Remove the override when the upstream persistence dependency allows patched versions.

## Release gates (maintainer)

Before publishing a beta:

- [x] The candidate passes `CI required`: card, Python, app, audits, image builds, Compose, hygiene, and public HACS validation.
- [x] Resolve dependency audit findings and scan the release tree. The OpenTelemetry override audits clean.
- [x] Review development history and curate a fresh public snapshot. Do not copy private history, discussions, task archives or captures.
- [x] Enable private vulnerability reporting, secret scanning/push protection, and protected-main PRs with required GitHub Actions `CI required`; disallow force pushes/deletion.
- [x] Prepare integration/card version `1.1.0-beta.1` together and verify a fresh card build. The separate HA app version remains independent.
- [x] Publish the curated snapshot with fresh history and pass HACS validation in the new public repository; retain the development repository privately.
- [x] Complete automated real-HA and isolated real-LiveKit checks, including worker restart, permission denial, scheduler outage, speech input/output, and conversation recovery. See [smoke evidence](smoke-tests.md).
- [x] Install and verify the exact candidate bundle, restart HA successfully, and receive maintainer confirmation of the physical mobile check.
- [x] Verify closed-state backup/restoration on disposable conversation and scheduler data, including restart and ownership checks.
- [x] Before the candidate integration install, capture a local HA configuration backup and component rollback copy; keep household worker/scheduler images unchanged.
- [x] Tag the tested candidate as `v1.1.0-beta.1` and pass the full tag pipeline, which creates a draft prerelease.
- [ ] Review and publish the prepared draft prerelease.

## Monitor and roll back

For the first beta installations, monitor worker/scheduler logs, voice connection errors, permission failures, saved conversation recovery, and schedule execution. Do not collect raw home transcripts as telemetry. Ask testers to report version, HA/browser version, redacted errors, and reproduction steps through GitHub issues.

Stop rollout immediately for cross-user access, lost conversations, or unintended device actions. Stop the worker first to prevent new actions. Reinstall the previous integration version and redeploy the previous worker/app image or commit. Restore the matching pre-upgrade `agent-data/` and scheduler database backup if storage compatibility changed; keep a copy of the failed state for private investigation. Recheck authentication, a harmless voice query, saved history, and a disposable schedule before reopening access. There is no automatic database downgrade guarantee.
