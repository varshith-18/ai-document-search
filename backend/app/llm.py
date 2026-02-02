import os
import re
import logging
from typing import List, Optional, Literal

_HAS_OPENAI = False
_HAS_OPENAI_V1 = False
_openai_client = None
_openai_api_key_cache: str | None = None

logger = logging.getLogger("app.llm")

try:
    # Preferred modern SDK (>=1.x)
    from openai import OpenAI
    _HAS_OPENAI = True
    _HAS_OPENAI_V1 = True
except Exception:
    try:
        # Legacy SDK (<=0.x)
        import openai  # type: ignore
        _HAS_OPENAI = True
        _HAS_OPENAI_V1 = False
    except Exception:
        openai = None
        _HAS_OPENAI = False
        _HAS_OPENAI_V1 = False

PROMPT_TEMPLATE = (
    "You are an assistant. Use the provided context chunks to answer the question as accurately and concisely.\n\n"
    "Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"
)


def _ensure_client(api_key: str | None):
    global _openai_client, _openai_api_key_cache
    if not _HAS_OPENAI:
        return None
    if _HAS_OPENAI_V1:
        # Recreate client if missing or API key changed
        if _openai_client is None or _openai_api_key_cache != api_key:
            # Allow optional organization/project for newer key types
            org = os.getenv('OPENAI_ORG') or os.getenv('OPENAI_ORGANIZATION') or os.getenv('OPENAI_ORG_ID')
            project = os.getenv('OPENAI_PROJECT') or os.getenv('OPENAI_PROJECT_ID')
            kwargs = {"api_key": api_key}
            if org:
                kwargs["organization"] = org
            if project:
                kwargs["project"] = project
            _openai_client = OpenAI(**kwargs)  # type: ignore[name-defined]
            _openai_api_key_cache = api_key
        return _openai_client
    else:
        # legacy
        if openai is not None and api_key:
            openai.api_key = api_key
        return openai


def llm_status(model_override: str | None = None) -> dict:
    """Return LLM readiness without making a network call.
    ok: True if SDK present and API key non-empty.
    reason: brief text when not ok.
    model: the model that would be used.
    """
    model = model_override or os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo-0125')
    key = os.getenv('OPENAI_API_KEY')
    if not _HAS_OPENAI:
        return {"ok": False, "reason": "OpenAI SDK not installed", "model": model}
    if not key:
        return {"ok": False, "reason": "Missing OPENAI_API_KEY", "model": model}
    # We don't hit the network here. Assume ok if key exists; runtime errors are handled in call path.
    return {"ok": True, "reason": None, "model": model}


def ping_llm(model_override: Optional[str] = None) -> dict:
    """Attempt a tiny completion to validate API key, model access, and network.

    Returns { ok: bool, model: str, reason: Optional[str] } without raising.
    This uses max_tokens=1 and a single-message prompt to minimize token usage.
    """
    key = os.getenv('OPENAI_API_KEY')
    model = model_override or os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo-0125')
    if not _HAS_OPENAI:
        return {"ok": False, "model": model, "reason": "OpenAI SDK not installed"}
    if not key:
        return {"ok": False, "model": model, "reason": "Missing OPENAI_API_KEY"}
    client = _ensure_client(key)
    try:
        if _HAS_OPENAI_V1:
            # Use a single minimal user message to keep TPM usage tiny
            resp = client.chat.completions.create(  # type: ignore[attr-defined]
                model=model,
                messages=[{"role": "user", "content": "ping"}],
                temperature=0.0,
                max_tokens=1,
                stream=False,
            )
            _ = resp.choices[0].message.content
        else:
            resp = client.ChatCompletion.create(  # type: ignore[attr-defined]
                model=model,
                messages=[{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "ping"}],
                temperature=0.0,
                max_tokens=1,
            )
            _ = resp["choices"][0]["message"]["content"]
        return {"ok": True, "model": model, "reason": None}
    except Exception as e:
        # Treat rate limits as "connected but limited" so the UI can show a clearer state
        msg = (str(e) or "")[:500]
        low = msg.lower()
        if "rate limit" in low or "rate_limit" in low:
            return {"ok": True, "model": model, "reason": f"rate_limited: {msg}"}
        return {"ok": False, "model": model, "reason": msg}


def synthesize_answer(
    question: str,
    retrieved: List[dict],
    max_tokens: int = 256,
    model_override: Optional[str] = None,
    persona: Optional[str] = None,
    history: Optional[List[dict]] = None,
) -> dict:
    """Return a dict with 'answer' and 'used_chunks'. If OpenAI is not available, return a simple fallback.

    This function reads OPENAI_API_KEY at call time so loading order of .env doesn't matter.
    """
    # build context robustly
    context_items = []
    for r in retrieved:
        meta = r.get('meta') if isinstance(r, dict) else {}
        if isinstance(meta, dict):
            text = meta.get('text')
            if text:
                context_items.append(f"- {text}")
                continue
            # fallback to source or repr of meta
            src = meta.get('source')
            if src:
                context_items.append(f"- source: {src}")
                continue
        context_items.append("- (no text)")

    context = "\n\n".join(context_items)

    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    if _HAS_OPENAI and OPENAI_API_KEY:
        client = _ensure_client(OPENAI_API_KEY)
        try:
            if _HAS_OPENAI_V1:
                messages = _build_messages(question, retrieved, persona=persona, history=history)
                model = model_override or os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo-0125')
                resp = client.chat.completions.create(  # type: ignore[attr-defined]
                    model=model,
                    messages=messages,
                    temperature=0.0,
                    max_tokens=max_tokens,
                    stream=False,
                )
                text = resp.choices[0].message.content or ""
                return {"answer": text.strip(), "used_chunks": [r.get('meta') for r in retrieved]}
            else:
                # legacy ChatCompletion
                messages = _build_messages(question, retrieved, persona=persona, history=history)
                model = model_override or os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo')
                resp = client.ChatCompletion.create(  # type: ignore[attr-defined]
                    model=model,
                    messages=messages,
                    temperature=0.0,
                    max_tokens=max_tokens,
                )
                text = resp["choices"][0]["message"]["content"]
                return {"answer": (text or "").strip(), "used_chunks": [r.get('meta') for r in retrieved]}
        except Exception as e:
            # Graceful fallback on OpenAI errors (e.g., invalid key)
            try:
                logger.exception("LLM non-streaming call failed: %s", e)
            except Exception:
                pass
            joined = "\n\n".join([ (r.get('meta') or {}).get('text','') if isinstance(r.get('meta'), dict) else '' for r in retrieved ])
            reason = (str(e)[:200] if e else "")
            prefix = "(LLM unavailable or misconfigured)"
            if reason:
                prefix = f"(LLM error: {reason})"
            answer = f"{prefix} Showing retrieved context only.\n\n{joined}"
            return {"answer": answer, "used_chunks": [r.get('meta') for r in retrieved]}

    # simple fallback: join top-k chunk texts
    joined = "\n\n".join([ (r.get('meta') or {}).get('text','') if isinstance(r.get('meta'), dict) else '' for r in retrieved ])
    answer = f"(LLM unavailable) Context summary:\n{joined}\n\nQuestion: {question}"
    return {"answer": answer, "used_chunks": [r.get('meta') for r in retrieved]}


def _build_messages(
    question: str,
    retrieved: List[dict],
    *,
    persona: Optional[str] = None,
    history: Optional[List[dict]] = None,
):
    # Enumerate context so the model can cite with [n].
    # Control prompt size to avoid excessive tokens and rate-limit spikes.
    per_chunk_limit = int(os.getenv("RAG_CONTEXT_CHARS_PER_CHUNK", "800"))
    max_context_chars = int(os.getenv("RAG_CONTEXT_MAX_CHARS", "5000"))
    ctx_lines: List[str] = []
    used = 0
    for i, r in enumerate(retrieved, start=1):
        text = (r.get('meta') or {}).get('text', '') if isinstance(r, dict) else ''
        if not text:
            continue
        # Trim each chunk and stop when overall budget is reached
        trimmed = text[:per_chunk_limit]
        line = f"[{i}] {trimmed}"
        if used + len(line) > max_context_chars:
            break
        ctx_lines.append(line)
        used += len(line)
    context = "\n\n".join(ctx_lines)
    # Persona presets to influence tone & format
    persona = (persona or "concise").lower()
    if persona == "bullets":
        tone = (
            "You are a helpful, professional assistant for a RAG system. Use ONLY the provided context below (which was extracted from the user's uploaded PDFs). "
            "Never say that you cannot access or analyze uploaded files; treat the provided context as the relevant excerpts. "
            "Answer briefly using 3-6 bullet points. Each bullet should be a short sentence. "
            "Cite sources inline with [n] matching the numbered context entries. "
            "If the question is broad (e.g., 'tell me about my PDF'), provide a concise summary using the context. "
            "If context is incomplete, say what's missing and ask a targeted follow-up. Do not invent facts beyond the context."
        )
    elif persona == "step-by-step":
        tone = (
            "You are a friendly tutor for a RAG system. Use ONLY the provided context below (excerpts from uploaded PDFs). "
            "Never say you cannot read or access files; you can use the provided context. "
            "Explain step-by-step in clear, numbered steps (3-7 steps). Keep each step concise. "
            "Cite sources inline with [n] where relevant. Indicate uncertainty if context is thin, and suggest a follow-up if needed."
        )
    elif persona == "formal":
        tone = (
            "You are a formal, professional assistant for a RAG system. Use ONLY the provided context below (from uploaded PDFs). "
            "Never claim inability to access files; rely on the provided context. "
            "Respond in 2-5 compact sentences. Maintain a neutral tone. "
            "Include inline citations with [n]. Acknowledge uncertainty if needed."
        )
    else:  # default: concise
        tone = (
            "You are a helpful assistant for a RAG system. Use ONLY the provided context below (extracted from the user's uploaded PDFs). "
            "Do NOT say you cannot access or analyze uploaded files; treat the provided context as the accessible content. "
            "If the user asks generally about their PDF, summarize it using the context. "
            "Answer succinctly in 2-5 sentences or short bullets. "
            "Cite sources inline with [n] matching the numbered context entries. "
            "If information is incomplete, give the best answer you can using the most relevant context and note uncertainties. "
            "Do not invent facts beyond the context."
        )

    system = {
        "role": "system",
        "content": tone,
    }
    user = {
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {question}\nAnswer (with citations):",
    }

    messages: List[dict] = [system]
    # Optional: include short rolling history before the current user input
    # history format: [{"role": "user"|"assistant", "content": str}, ...]
    if history:
        for h in history[-10:]:  # keep it small
            r = h.get("role")
            c = h.get("content")
            if r in ("user", "assistant") and isinstance(c, str) and c.strip():
                messages.append({"role": r, "content": c.strip()})
    messages.append(user)
    return messages


def stream_synthesize_answer(
    question: str,
    retrieved: List[dict],
    max_tokens: int = 512,
    model_override: Optional[str] = None,
    persona: Optional[str] = None,
    history: Optional[List[dict]] = None,
):
    """Yield chunks of the answer as they are produced by the model. Falls back to single chunk if OpenAI not configured."""
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    if _HAS_OPENAI and OPENAI_API_KEY:
        client = _ensure_client(OPENAI_API_KEY)
        try:
            messages = _build_messages(question, retrieved, persona=persona, history=history)
            if _HAS_OPENAI_V1:
                model = os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo-0125')
                if model_override:
                    model = model_override
                stream = client.chat.completions.create(  # type: ignore[attr-defined]
                    model=model,
                    messages=messages,
                    temperature=0.0,
                    max_tokens=max_tokens,
                    stream=True,
                )
                pending = ""
                for chunk in stream:
                    delta = chunk.choices[0].delta.content or ""
                    if not delta:
                        continue
                    pending += delta
                    # avoid splitting citation markers like "[12]" across chunks
                    last_open = pending.rfind("[")
                    last_close = pending.rfind("]")
                    if last_open > last_close:
                        # hold until we see a closing bracket
                        safe_prefix = pending[:last_open]
                        if safe_prefix:
                            yield safe_prefix
                            pending = pending[last_open:]
                    else:
                        yield pending
                        pending = ""
                if pending:
                    yield pending
                return
            else:
                model = os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo')
                if model_override:
                    model = model_override
                stream = client.ChatCompletion.create(  # type: ignore[attr-defined]
                    model=model,
                    messages=messages,
                    temperature=0.0,
                    max_tokens=max_tokens,
                    stream=True,
                )
                pending = ""
                for chunk in stream:
                    delta = chunk["choices"][0]["delta"].get("content", "")
                    if not delta:
                        continue
                    pending += delta
                    last_open = pending.rfind("[")
                    last_close = pending.rfind("]")
                    if last_open > last_close:
                        safe_prefix = pending[:last_open]
                        if safe_prefix:
                            yield safe_prefix
                            pending = pending[last_open:]
                    else:
                        yield pending
                        pending = ""
                if pending:
                    yield pending
                return
        except Exception as e:
            # Graceful streaming fallback on OpenAI errors
            try:
                logger.exception("LLM streaming failed: %s", e)
            except Exception:
                pass
            msg = str(e) if e else ""
            if msg:
                low = msg.lower()
                # If rate limited, surface a clear, short instruction
                if "rate limit" in low or "rate_limit" in low:
                    wait_hint = None
                    m = re.search(r"try again in ([0-9]+m)?([0-9]+(?:\.[0-9]+)?s)", msg)
                    if m:
                        wait_hint = (m.group(0) or "").replace("try again in ", "")
                    notice = "We are temporarily rate-limited by the LLM provider."
                    if wait_hint:
                        notice += f" Please retry in {wait_hint}."
                    yield f"(LLM rate-limited) {notice}\n\nShowing retrieved context only."
                    return
            fallback = synthesize_answer(question, retrieved, max_tokens=max_tokens, persona=persona, history=history)["answer"]
            yield fallback
            return

    # Fallback single-chunk stream when no OpenAI
    fallback = synthesize_answer(question, retrieved, max_tokens=max_tokens, persona=persona, history=history)["answer"]
    yield fallback
