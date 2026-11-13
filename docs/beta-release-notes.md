# Backend Butler 1.1.0-beta.1 — release notes draft

Talk to your home with Backend Butler, a voice-first Home Assistant companion powered by LiveKit. Follow the conversation through live captions, switch to text, and return to saved history. Manage people, tools, devices, and schedules from the dashboard card.

This candidate includes persistent voice conversations, improved mobile layouts and recovery feedback, a visible dictation glow, and the approved Arkitect branding. The separate Agent SDK HA app also improves composer resizing and placeholder wrapping.

## Getting started

Use the [public beta guide](public-beta.md) and [Home Assistant integration guide](home-assistant.md). You provide your own Home Assistant and LiveKit/model credentials; inference can incur charges. Keep the worker and scheduler APIs on a trusted network and start with harmless device queries.

## Before publication

Select the beta version and tested commit, complete the [release gates](public-beta.md), and verify the patched OpenTelemetry audit remains clean. The public repository uses a curated source snapshot and fresh history; the development repository stays private. HACS must pass on the public repository. Automated real-HA, real-LiveKit speech/reconnect, owner isolation and disposable-state recovery tests pass. Repeat the physical mobile check after installing this exact candidate bundle before inviting testers.

Beta storage/API compatibility can change. Back up conversation state and scheduler data before upgrading. Report redacted issues through GitHub; report vulnerabilities privately following [SECURITY.md](../SECURITY.md).
