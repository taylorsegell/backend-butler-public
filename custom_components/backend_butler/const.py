"""Constants for the Backend Butler integration."""

DOMAIN = "backend_butler"

# Config-entry keys.
CONF_LIVEKIT_URL = "livekit_url"
CONF_API_KEY = "api_key"
CONF_API_SECRET = "api_secret"
CONF_AGENT_NAME = "agent_name"
# Base URL of the scheduler service (e.g. http://192.168.1.50:8080) and its shared secret.
# When set, the card's Schedules tab can list/manage tasks directly through a proxy.
CONF_SCHEDULER_URL = "scheduler_url"
CONF_SCHEDULER_TOKEN = "scheduler_token"
# Base URL of the worker's HTTP app (e.g. http://192.168.1.50:8952) and its TEXT_API_TOKEN.
# When set, the card's Text tab shows and continues the worker's persisted text conversation.
CONF_CHAT_URL = "chat_url"
CONF_CHAT_TOKEN = "chat_token"
# Base URL of a music server (e.g. http://192.168.1.50:8961) the voice agent plays music
# with. When set, a media_player entity shows and controls what it plays.
CONF_MUSIC_URL = "music_url"

# Matches AGENT_NAME in agent/agent.py (the worker's explicit-dispatch name).
DEFAULT_AGENT_NAME = "ha-agent"

# Served card bundle (built from ../card via esbuild) and its public URL.
CARD_FILENAME = "backend-butler-card.js"
CARD_URL = "/backend_butler/backend-butler-card.js"

# Token endpoint the card calls via `hass.callApi('POST', 'backend_butler/token', ...)`.
TOKEN_URL = "/api/backend_butler/token"

# Scheduler proxy the card calls via `hass.callApi(...)`; forwards to the scheduler service
# so the Schedules tab can list/get/edit/delete tasks without a LiveKit connection.
TASKS_URL = "/api/backend_butler/tasks"
TASK_URL = "/api/backend_butler/tasks/{task_id}"
# Settings proxy (e.g. notify.* push targets); forwards to the scheduler's /settings.
SETTINGS_URL = "/api/backend_butler/settings"
# Text chat proxy for the Text tab; forwards to the worker's /chat and /chat/*.
CHAT_URL = "/api/backend_butler/chat"
CHAT_HISTORY_URL = "/api/backend_butler/chat/history"
CHAT_CANCEL_URL = "/api/backend_butler/chat/cancel"
CHAT_WARM_URL = "/api/backend_butler/chat/warm"
CHAT_CONVERSATIONS_URL = "/api/backend_butler/chat/conversations"
CHAT_SWITCH_URL = "/api/backend_butler/chat/switch"
CHAT_DELETE_URL = "/api/backend_butler/chat/delete"
# Turn progress on a phone (start / progress / final); the worker posts here with an HA token.
PROGRESS_URL = "/api/backend_butler/progress"

# hass.data[DOMAIN] keys.
DATA_CONFIG = "config"
DATA_REGISTERED = "registered"
DATA_PROGRESS = "progress"
