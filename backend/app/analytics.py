from __future__ import annotations
from typing import Dict, Any
from datetime import datetime

# Very simple in-memory analytics per user_id
# For production use a database or Redis

_analytics: Dict[str, Dict[str, Any]] = {}

def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def ensure_user(user_id: str) -> Dict[str, Any]:
    if user_id not in _analytics:
        _analytics[user_id] = {
            "user_id": user_id,
            "first_seen": _now_iso(),
            "last_seen": _now_iso(),
            "queries": 0,
            "llm_queries": 0,
            "uploads": 0,
            "sessions": 0,
        }
    return _analytics[user_id]


def record_session(user_id: str) -> None:
    u = ensure_user(user_id)
    u["sessions"] += 1
    u["last_seen"] = _now_iso()


def record_query(user_id: str, llm_used: bool) -> None:
    u = ensure_user(user_id)
    u["queries"] += 1
    if llm_used:
        u["llm_queries"] += 1
    u["last_seen"] = _now_iso()


def record_upload(user_id: str) -> None:
    u = ensure_user(user_id)
    u["uploads"] += 1
    u["last_seen"] = _now_iso()


def get_profile(user_id: str) -> Dict[str, Any]:
    return ensure_user(user_id)
