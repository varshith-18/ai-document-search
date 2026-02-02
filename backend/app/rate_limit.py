import time
from typing import Tuple


# Simple in-memory token bucket per IP. Not for multi-process or production use.
_buckets = {}


def allow(ip: str, capacity: int = 60, per_seconds: int = 60, cost: int = 1) -> Tuple[bool, float, int]:
    """Return (allowed, retry_after_seconds, remaining_tokens).

    capacity: max tokens in the bucket
    per_seconds: refill window for the full capacity
    cost: tokens required for this request
    """
    now = time.monotonic()
    rate = capacity / per_seconds
    tokens, last = _buckets.get(ip, (capacity, now))
    # refill
    tokens = min(capacity, tokens + (now - last) * rate)
    if tokens >= cost:
        tokens -= cost
        _buckets[ip] = (tokens, now)
        return True, 0.0, int(tokens)
    # not enough tokens: compute wait time
    needed = cost - tokens
    retry_after = needed / rate
    _buckets[ip] = (tokens, now)
    return False, retry_after, int(tokens)
