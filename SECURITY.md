# Security

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository when available: **Security → Report a vulnerability**. If that option is unavailable, contact the repository owner through their GitHub profile to arrange a private channel. Do not post exploitable details, credentials, conversation data, or home information in a public issue.

Include the affected commit/version, a minimal reproduction using synthetic data, impact, and any suggested fix. There is no promised response SLA during beta. Only the latest beta candidate receives fixes; upgrade before reporting an already resolved issue.

## Deployment boundaries

Butler can access the Home Assistant entities and tools you expose. Use a dedicated HA account, expose only intended entities, and review per-person tool permissions. Keep worker, scheduler, and bridge APIs on a trusted network; do not expose them directly to the internet. Use HTTPS for browser access and microphone permissions.

Set unique service credentials (`TEXT_API_TOKEN`, `SCHEDULER_TOKEN`, and any app bridge token). Keep service tokens on servers; do not distribute them as personal client credentials. Back up configuration and persisted conversations securely. Voice, transcripts, prompts, and tool results may be sent to configured LiveKit/inference and model providers. Review those providers' settings before using sensitive data.

A clean secret scan does not certify the repository or its dependencies as secure. See the [beta release gates](docs/public-beta.md) for outstanding validation.
