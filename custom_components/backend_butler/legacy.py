"""Knowledge of the pre-1.0.0 integration, kept in one place.

The integration domain was renamed in 1.0.0. An installed house still has a config entry under
the old domain; this module lets the new config flow pre-fill from it and lets setup warn that it
should be deleted. Nothing here moves or rewrites registry entries. Remove this module together
with the compatibility alias.
"""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

LEGACY_DOMAIN = "livekit_voice"

LEGACY_ENTRY_WARNING = (
    "An old LiveKit Voice Assistant entry still exists; "
    "delete it in Settings > Devices & Services."
)


def legacy_entry(hass: HomeAssistant) -> ConfigEntry | None:
    """Return the first config entry of the old domain, or None."""
    entries = hass.config_entries.async_entries(LEGACY_DOMAIN)
    return entries[0] if entries else None


def legacy_defaults(hass: HomeAssistant) -> dict[str, Any]:
    """Return the old entry's settings (options over data), or an empty dict."""
    entry = legacy_entry(hass)
    return {**entry.data, **entry.options} if entry else {}
