# Backend Butler 1.1.0-beta.1 — release notes draft

Talk to your home with Backend Butler, a voice-first Home Assistant companion powered by LiveKit. Follow the conversation through live captions, switch to text, and return to saved history. Manage people, tools, devices, and schedules from the dashboard card.

This candidate includes persistent voice conversations, improved mobile layouts and recovery feedback, a visible dictation glow, and the approved Arkitect branding. The separate Agent SDK HA app also improves composer resizing and placeholder wrapping.

## Getting started

Use the [public beta guide](public-beta.md) and [Home Assistant integration guide](home-assistant.md). You provide your own Home Assistant and LiveKit/model credentials; inference can incur charges. Keep the worker and scheduler APIs on a trusted network and start with harmless device queries.

## Before publication

The candidate is tagged and passes the full CI/release pipeline, including HACS and clean dependency/secret audits. Real HA, LiveKit speech/reconnect/restart, owner isolation and disposable-state recovery checks pass. The installed card was verified against the candidate bundle, and the maintainer confirmed the exact-candidate mobile check. The public repository has fresh history and enforced CI/PR protections; the development repository remains private. Review and publish the prepared draft after the [release checklist](public-beta.md).

Beta storage/API compatibility can change. Back up conversation state and scheduler data before upgrading. Report redacted issues through GitHub; report vulnerabilities privately following [SECURITY.md](../SECURITY.md).
