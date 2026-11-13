# Backend Butler

Backend Butler is a chat with an AI agent that can look at your Home Assistant, control your devices, and write automations and scripts for you. Open it from **Backend Butler** in the sidebar.

## Setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. Open the app's **Configuration** tab and paste it into **Anthropic API key**.
3. Optionally change **Model**. The default is `claude-sonnet-5-5`.
4. Save, then restart the app.

Until a key is set, the chat tells you to add one.

## What it can do

- **Reads and everyday device control run directly.** Looking up entities and states, and turning lights, switches, fans, climate, media players and vacuums on, off or up and down, happen without asking.
- **Everything else asks first.** Running a script or scene, triggering an automation, pressing a button, sending a notification, publishing MQTT, playing a media URL and any other service shows an approval card with the exact call. Text the agent reads (a song title, a calendar invite, a device name) could carry instructions, and these services reach further than one device.
- **Some things are never available.** Physical-security devices (locks, alarms and covers such as garage doors) cannot be controlled, and nothing that changes Home Assistant itself runs (restarts, reloads, backups, updates, shell commands).
- **Automations and scripts always ask first.** Creating, editing or deleting an automation or script shows an approval card with what will change. Nothing is written until you approve it.

## Chats

- Opening the app resumes your last chat if you used it within the past 2 hours. Otherwise you start a new one.
- **Archive** a chat from the chat list to hide it. Archived chats are kept, can be restored, and are never resumed automatically.
- **Delete** removes a chat for good.

## Photos

Attach up to 4 photos to a message and ask about them. Photos are resized on your phone before they are sent.

## Skills

A skill is a saved set of instructions you run by name.

### Built-in Home Assistant skills

Backend Butler ships with seven skills, adapted from the community [Home Assistant best practices](https://github.com/homeassistant-ai/skills) skill:

| Skill | Covers |
|---|---|
| `ha-automations` | Automations and scripts: native triggers and conditions, modes, waits, actions |
| `ha-devices` | Device control, scenes, and why a device isn't responding as expected |
| `ha-safe-changes` | Renames without breaking things, backups, recovering from a bad change |
| `ha-helpers` | Which built-in helper to use instead of a template sensor |
| `ha-templates` | When Jinja is the right tool, and shared macros |
| `ha-dashboards` | Views and card types (advice: Butler can't edit dashboards itself) |
| `ha-blueprints` | Writing and using blueprints |

The agent loads the matching skill by itself before it writes or changes config. You can also run one from the `/` menu. To change a built-in skill, create your own skill with the same name; yours replaces it.

### Your own skills

1. Open the app's config folder: `addon_configs/<id>_backend_butler` (`app_configs/…` on newer Home Assistant versions), reachable with the Samba share or a file editor app. On first start the app creates a `skills` folder there with a README. Create `skills/<name>/SKILL.md`.
2. Start the file with a header giving the skill's `name` and `description`:

   ```
   ---
   name: goodnight
   description: Turn off the living room and dim the nightstands.
   ---
   Turn off every light in the Living Room. Then set the nightstand lights to 10%.
   ```

3. In the chat, type `/goodnight`, or type `/` and pick it from the menu.

Skills are instructions only. They add no new abilities, so everything a skill does still follows the rules above, including approval cards. A skill cannot run shell commands: a skill that tries (a `` !`command` `` line) fails to load.

## Household notes

Create `household.md` in the same folder. The agent always knows what it says, and it wins over general knowledge. Use it for facts about your home and how you talk about it:

```
- "Saffron" means #FF9933.
- The lantern is a plug, not a light.
```

Notes are limited to about 4,000 characters. They are read on each message, so edits apply right away.

## iPhone home screen widget

`widget/butler-widget.js` is a widget for [Scriptable](https://scriptable.app), a free iOS app. On a medium widget it shows an **Ask Butler** bar and four buttons, like the ChatGPT widget:

| Tap | What happens |
|---|---|
| Ask Butler | Opens Butler with the message box ready |
| Camera / photo | Opens Butler with one tap left to open the camera or your library |
| Microphone | You dictate on the phone; Butler opens a new chat with your words in the box to check |
| Waveform | You dictate on the phone; Butler opens a new chat with your words and one big **Send** button |

Dictation happens in Scriptable, with iPhone dictation, so it works at home over plain `http` too. A small widget is a single button that opens the message box.

To install it: in Scriptable tap **+**, paste the file, and name the script `Butler`. Then add a Scriptable widget to the home screen, edit it, and pick the script **Butler**.

If you installed Butler from `https://github.com/taylorsegell/backend-butler-public`, set `PANEL` at the top of the script to `4f7f9ac1_backend_butler`. The script's default, `e0a0a4ab_backend_butler`, is the panel of an install from the original (now archived) app repo. For any other install, open Butler in a browser and copy what follows the host in the address bar into `PANEL` (for a local copy, `local_backend_butler`).

The widget uses Home Assistant app links, which you can also use from Shortcuts or anywhere else: `homeassistant://navigate/<panel>?butler=<kind>`, where kind is `field`, `camera`, `photo`, `mic`, `voice` or `new`. `butler=say&text=<words>` puts the words in a new chat with a **Send** button, and `butler=draft&text=<words>` just puts them in the box. A link never sends anything by itself: anyone can make a link, so you always see the words and tap Send. If a change is waiting for your approval, Butler stays in that chat and puts the words in the box instead.

## Voice worker

The voice worker can hand a request to Butler when the request needs Home Assistant changes that go beyond what the worker does itself. The app opens a second port for this, called the bridge. It speaks MCP and requires a bearer token. It stays closed until you set **Bridge token**.

**Tools the worker gets:**

- `hand_to_butler` starts a Butler chat for a request and returns at once. Butler works in the background and reports back to the worker when it finishes or needs approval.
- `decide_approval` approves or declines a waiting change by its id.
- `butler_status` shows what a hand-off chat is doing and which changes wait for approval.

**Setup:**

1. Set **Bridge token** on the app's Configuration tab to a long random value. Save and restart the app.
2. On the worker, set `BUTLER_API_TOKEN` to the same value. Copy the other lines from `.env.example` (they include the callback settings the worker needs so Butler can report back), then restart the worker.

**Approvals still apply.** Every write that asks for approval in the sidebar asks for it here too. A hand-off waits 15 minutes for an answer, then the change is declined. The worker relays the question to the person, and the person's answer goes back through `decide_approval`.

**Hand-off chats show in the sidebar chat list.** The sidebar is the admin view: it can open and continue hand-off chats and approve or decline their changes. Per-person separation applies between voice users, not against the sidebar.

**Troubleshooting:** run `curl -H "Authorization: Bearer <token>" http://<home-assistant-host>:<bridge-port>/api/health`. A `401` means the token is wrong. "Connection refused" means **Bridge token** is empty or the app was not restarted after you set it.

## Privacy

**What leaves your home:** your messages and photos, your household notes, and what the agent looks up (entity names, areas, states and attributes, and automation and script configs it reads to edit) go to Anthropic's API with your key. Nothing goes anywhere else. Voice is transcribed by the Assist pipeline you choose in Home Assistant, so where the audio goes depends on its speech-to-text engine. The app keeps no audio.

- Requests from the voice worker are sent to Anthropic like sidebar messages.

**What stays on your Home Assistant:** chats, the photos you send, and the agent's session history, in the app's data folder. They are kept until you delete the chat; deleting it removes its photos and history too. Archived chats are kept. App backups include this folder. Your API key is stored in the app's options like any other app setting.

**Who can see chats:** every Home Assistant administrator. The panel is admin-only, and all admins share one chat list.

## Troubleshooting

- **"No Anthropic API key is configured":** add your key on the Configuration tab and restart the app.
- **An error from Home Assistant:** the agent shows Home Assistant's error text as it was returned and says what it will try next.
- **A request is refused:** locks, alarms and covers are never controlled, and services that change Home Assistant itself (restarts, reloads, backups, updates, shell commands) are not available. Other services that aren't everyday device control show an approval card first.
- **A skill or note is missing:** check the file name and location (`skills/<name>/SKILL.md`, `household.md`) and that the skill header has both `name` and `description`.
