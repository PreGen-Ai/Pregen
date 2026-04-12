"""Bug routing rules for ClickUp assignees."""

from __future__ import annotations

from app.config import get_settings

settings = get_settings()

OWNER_MAP: dict[str, list[str]] = settings.owner_map
COMPONENT_MAP: dict[str, str] = settings.component_team_map


def route_assignees(component: str | None, team: str | None) -> list[str]:
    """Return ClickUp assignee IDs for a component or fallback team."""

    normalized_component = (component or "unknown").strip().lower()
    normalized_team = (team or "qa").strip().lower()

    if normalized_component in OWNER_MAP:
        return OWNER_MAP[normalized_component]

    if normalized_team in OWNER_MAP:
        return OWNER_MAP[normalized_team]

    return OWNER_MAP.get("qa", [])
