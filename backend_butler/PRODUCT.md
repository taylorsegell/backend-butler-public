# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
One person: Taylor, the sole Home Assistant admin of a homelab. Reaches Backend Butler inside Home Assistant —
mostly the HA companion app on an iPhone, sometimes desktop. Uses it about equally for quick commands
("lights off", "which lights are on?") and for longer threads they come back to (planning an evening setup,
building and refining an automation).

## Product Purpose
A Claude agent that actually works inside Home Assistant: reads state, controls devices, and creates/edits
automations and scripts, holding full context within a conversation. It replaces the `claude_chat`
integration, whose tool calls failed, could not add automations, and lost context. Success = real requests
complete end to end from the phone without retries.

## Positioning
Lives inside HA as an app (ingress panel), not as a separate site or a chat bolted onto a dashboard card.
Every change to HA configuration is shown as a reviewable preview/diff and only happens on explicit approval;
ordinary device control just happens and is confirmed from read-back state.

## Operating Context
- Rendered inside HA's ingress panel: HA's own header (title + ☰ for the HA sidebar) always sits above it on
  mobile and cannot be changed or hidden by the app. Same origin as the HA frontend.
- Taylor's HA theme is a custom visionOS variant: warm near-black background, translucent blurred header,
  20px card radius, orange primary color.
- Often used one-handed, at night, in passing; sometimes a 10+ turn planning session.

## Capabilities and Constraints
- Chats persist and resume (list of past chats); chats can be deleted; a chat is resumed on open only if used
  within the last 2 hours, otherwise a fresh one starts (decided 2026-10-06). Tool activity is shown inline; approval cards carry YAML
  previews or diffs and Approve/Deny.
- Ingress-only; no separate login. Single user; no cross-chat memory in v1.
- Stack: Vite + React SPA with relative URLs, Node server, Claude Agent SDK.
- Undecided: whether household facts (e.g. what "saffron" means) get a user-editable "House notes" option.

## Brand Commitments
- Name: Backend Butler.
- Logo (Taylor, 2026-10-05): a speech bubble cut as a tuxedo jacket, white shirt-front V with three studs,
  orange bow tie. Source: `web/assets/logo.svg` (1024²; jacket/studs #020202, bow tie #FC6B02; shirt-front is
  negative space). The bow-tie orange is brand color and is not recolored.
- Inherited design language "The Night Ops Room" (from the earlier chat-ui DESIGN.md): calm dark console,
  one warm accent, borders over shadows, monospace only for literal content. Taylor chose to blend it with
  their HA theme rather than replace or keep it unchanged (2026-10-05).

## Evidence on Hand
Real chats from acceptance runs (A1–A5, A7) under /data/chats on the installed app; screenshots of the phone
UI showing the double header and top gap. No user research beyond Taylor.

## Product Principles
- Do what was asked, then prove it: confirm from HA's state, never claim unseen success.
- Nothing changes HA configuration without a visible, specific approval.
- Inside HA, feel like part of HA: never compete with HA's own navigation.
- Honest over helpful-sounding: say "that sensor doesn't exist" rather than invent one.
