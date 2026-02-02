from collections import deque
from typing import Deque, Dict, List, Tuple

# Simple in-memory chat memory per session_id
# Stores pairs of (user, assistant) strings; not persisted.

_MAX_TURNS_DEFAULT = 5

class SessionMemory:
    def __init__(self, max_turns: int = _MAX_TURNS_DEFAULT) -> None:
        self.max_turns = max_turns
        self._store: Dict[str, Deque[Tuple[str, str]]] = {}

    def add_turn(self, session_id: str, user_text: str, assistant_text: str) -> None:
        if not session_id:
            return
        dq = self._store.setdefault(session_id, deque(maxlen=self.max_turns))
        dq.append((user_text or "", assistant_text or ""))

    def get_history_messages(self, session_id: str, limit_pairs: int | None = None) -> List[dict]:
        """Return a flat list of chat messages alternating user/assistant for the given session.
        Format matches OpenAI Chat messages: {role, content}.
        """
        if not session_id or session_id not in self._store:
            return []
        dq = self._store[session_id]
        pairs = list(dq)[- (limit_pairs or self.max_turns) :]
        msgs: List[dict] = []
        for u, a in pairs:
            if u:
                msgs.append({"role": "user", "content": u})
            if a:
                msgs.append({"role": "assistant", "content": a})
        return msgs

    def clear(self, session_id: str) -> None:
        if session_id in self._store:
            del self._store[session_id]

MEMORY = SessionMemory()
