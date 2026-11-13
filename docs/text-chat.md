# Text chat API

The worker answers text over HTTP on port 8952 (8081 in the container). The card's Text tab, the scheduler, iPhone Shortcuts and webhooks all use it. Each person has one current conversation, saved to disk, so it survives restarts until a new one is asked for.

```bash
curl -X POST http://<agent-host>:8952/chat \
     -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' \
     -d '{"text": "Are the living room lights on?", "wait": true}'
```

## Tokens

Every route needs a bearer token, and with `TEXT_API_TOKEN` unset none is mounted.

| Token | Who holds it | What it reaches |
| --- | --- | --- |
| `TEXT_API_TOKEN` | The Home Assistant integration and the scheduler | Every route, acting for whichever `user` the request names |
| A person's token from `TEXT_USER_TOKENS` (`name=token,…`) | That person's own clients, such as a Shortcut | `/chat` routes only, always acting for that person |
| A callback token, derived per person | An MCP server marked `callback: true` | `/chat/events` for that person only |

`user` is a person's id: their name, ignoring case, as listed in the card's Settings tab. Without one, a request is no one in particular.

## Routes

| Route | Body or query | Does |
| --- | --- | --- |
| `POST /chat` | `{"text", "new", "wait", "steps", "interrupt", "user"}`, or plain text with `?new=1&wait=1&steps=0&user=` | Sends a message. Answers `202` once the turn starts, and the answer reaches the person's phone. With `wait` it answers with the reply instead, up to `TEXT_REPLY_TIMEOUT` (80 s), after which it answers `[timeout] still working` and the turn carries on. `steps: false` leaves out the tool-call lines. `new: true` starts a new conversation first. A new message interrupts a running turn unless `interrupt` is false. |
| `POST /chat/cancel` | `{"user", "task_id", "force"}` | Stops the running turn's reply at once. `force` also cancels the tools it started. |
| `POST /chat/warm` | `{"user"}` | Loads the person's conversation ahead of their message, which takes a few seconds after `TEXT_IDLE_TIMEOUT`. |
| `GET /chat/history` | `?user=&limit=200&conversation_id=` | The conversation's messages and tool calls, and `busy` while a turn runs. |
| `GET /chat/conversations` | `?user=` | The person's conversations, latest first, and which one is current. |
| `POST /chat/switch` | `{"user", "conversation_id"}` | Makes a past conversation current. |
| `POST /chat/delete` | `{"user", "conversation_id"}` | Deletes a past conversation. |
| `POST /chat/events` | `{"source", "text"}`, `?user=` | Takes a webhook's update, such as a coding agent that finished, into the conversation. The agent answers it with no tools, after any running turn. |

The `X-Conversation-Id` response header names the conversation. The integration proxies these routes as `/api/backend_butler/chat…` for the card, so its **Agent chat URL** is `http://<agent-host>:8952`, or `http://127.0.0.1:8952` when Home Assistant shares the Docker host's network.

## Settings

| Variable | Default | Does |
| --- | --- | --- |
| `TEXT_IDLE_TIMEOUT` | 1800 | Seconds a quiet conversation stays loaded before it is saved and unloaded. |
| `TEXT_RENEW_AFTER` | 0 (never) | Seconds without a message after which the next one starts a new conversation. |
| `TEXT_MAX_ITEMS` | 100 | Chat items the model keeps in context; the saved history keeps everything. |
| `TEXT_REPLY_TIMEOUT` | 80 | Seconds a `wait` request waits. Keep it under any reverse proxy's read timeout. |
| `TEXT_DATA_DIR` | `/data` | Where conversations are saved (`agent-data/` on the host). |

Progress on the phone and the reply buttons on an answer are the scheduler's; see [ha-notify-scheduler](../ha-notify-scheduler/README.md#progress-on-the-phone).

## iPhone Shortcut

`scripts/make_shortcut.py` builds a signed Shortcut on a Mac. Pass the person's own token, never `TEXT_API_TOKEN`:

```bash
uv run --no-project python scripts/make_shortcut.py -o "Ask Home.shortcut" \
  --url http://<agent-host>:8952/chat --token "<their TEXT_USER_TOKENS token>" --user alice
```

Without `--token` the file holds no secret, and each person enters their own on import. Run alone, the Shortcut stops the agent, dictates, and sends without waiting, so the answer arrives as a notification. Given text as input, it sends that instead.
