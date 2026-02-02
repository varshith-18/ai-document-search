from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import logging

from .rag import RAGIndex
from .llm import synthesize_answer, llm_status, ping_llm
from .memory import MEMORY
from .analytics import record_query, record_upload, get_profile
from .pdf_utils import extract_text_from_pdf_bytes, chunk_text
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from .rate_limit import allow as rl_allow
from fastapi import Request


# Load environment from both project root and backend/.env if present.
# This avoids confusion when starting uvicorn from different working directories.
from pathlib import Path

def _load_envs():
    root_env = Path(__file__).resolve().parents[2] / ".env"  # <repo>/.env
    backend_env = Path(__file__).resolve().parents[1] / ".env"  # backend/.env
    loaded_any = False
    for p in [root_env, backend_env]:
        try:
            if p.exists():
                load_dotenv(dotenv_path=str(p), override=True)
                loaded_any = True
        except Exception:
            pass
    if not loaded_any:
        # Fallback to default search (current working dir)
        load_dotenv()

_load_envs()

app = FastAPI(title="AI Document Search (RAG Chatbot)")

# Basic logging setup (leverages Uvicorn's handlers if present)
logger = logging.getLogger("app")
if not logger.handlers:
    # If no handlers (e.g., running plain), attach a stream handler
    _h = logging.StreamHandler()
    _fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s")
    _h.setFormatter(_fmt)
    logger.addHandler(_h)
logger.setLevel(logging.INFO)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_origin_regex=r".*",  # fallback for other local ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str


@app.get("/", response_model=HealthResponse)
async def read_root():
    """Simple health endpoint"""
    return {"status": "ok"}


class Message(BaseModel):
    text: str


class IngestRequest(BaseModel):
    texts: list[str]
    metas: list[dict] | None = None


INDEX = RAGIndex()


@app.post("/ingest")
async def ingest(req: IngestRequest):
    """Ingest a list of texts (e.g., chunks from PDFs) into the vector store."""
    texts = req.texts or []
    metas = req.metas or [{} for _ in texts]
    if len(texts) != len(metas):
        raise HTTPException(status_code=400, detail="texts and metas length mismatch")
    INDEX.add_texts(texts, metas)
    return {"ingested": len(texts)}


@app.post("/query")
async def query(message: Message, k: int = 4, use_llm: bool = False, model: str | None = None, request: Request = None, session_id: str | None = None, persona: str | None = None, user_id: str | None = None):
    """Query the index and return nearest metadata. Optionally synthesize an answer with an LLM."""
    # rate limit - small cost for standard query, larger if LLM used
    ip = request.client.host if request and request.client else "unknown"
    cost = 5 if use_llm else 1
    ok, retry_after, remaining = rl_allow(ip, capacity=60, per_seconds=60, cost=cost)
    if not ok:
        from fastapi import Response
        return Response(status_code=429, headers={"Retry-After": str(int(retry_after))}, content=f"Rate limit exceeded. Try again in {retry_after:.1f}s")
    # Clamp k to avoid overly large prompts
    try:
        max_k = int(os.getenv("RAG_MAX_K", "6"))
    except Exception:
        max_k = 6
    results = INDEX.query(message.text, k=min(k, max_k))
    # basic telemetry
    try:
        print(f"/query text='{message.text[:80]}' k={k} use_llm={use_llm} model={model} session_id={session_id}")
    except Exception:
        pass
    if use_llm:
        # synthesize using LLM; returns {'answer', 'used_chunks'}
        history_msgs = MEMORY.get_history_messages(session_id, limit_pairs=5) if session_id else []
        out = synthesize_answer(message.text, results, model_override=model, persona=persona, history=history_msgs)
        # store turn
        if session_id:
            try:
                MEMORY.add_turn(session_id, message.text, out.get('answer', ''))
            except Exception:
                pass
        # analytics
        try:
            if user_id:
                record_query(user_id, llm_used=True)
        except Exception:
            pass
        return {"results": results, "llm": out}
    # analytics (retrieval only)
    try:
        if user_id:
            record_query(user_id, llm_used=False)
    except Exception:
        pass
    return {"results": results}



@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...), chunk_size: int = 500, overlap: int = 50, user_id: str | None = None):
    """Upload a PDF file, extract text, chunk it and ingest into the index."""
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    logger.info("/upload received file='%s' user_id=%s chunk_size=%d overlap=%d", file.filename, user_id, chunk_size, overlap)
    try:
        data = await file.read()
        logger.info("/upload read %d bytes from '%s'", len(data or b""), file.filename)
        text = extract_text_from_pdf_bytes(data)
        chunks = chunk_text(text, chunk_size=chunk_size, overlap=overlap)
    except ImportError as ie:
        # Missing PDF parser
        logger.exception("PDF parser not available while processing '%s'", file.filename)
        raise HTTPException(status_code=500, detail=str(ie))
    except Exception as e:
        # Return a friendly error instead of letting the server crash
        logger.exception("Failed to parse PDF '%s'", file.filename)
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {e}")
    # include text in meta so future rebuilds (e.g., deletions) are possible even with faiss backend
    metas = [{"source": file.filename, "chunk": i, "text": chunks[i]} for i in range(len(chunks))]
    INDEX.add_texts(chunks, metas)
    logger.info("/upload ingested %d chunks for '%s'", len(chunks), file.filename)
    try:
        if user_id:
            record_upload(user_id)
    except Exception:
        pass
    return {"ingested_chunks": len(chunks)}


class DeleteRequest(BaseModel):
    id: int | None = None
    source: str | None = None


@app.delete("/delete")
async def delete_item(id: int | None = None, source: str | None = None):
    """Delete indexed items by id (single chunk) or by source (all chunks from a file).

    Returns {removed_count} with number of removed chunks.
    """
    if id is None and not source:
        raise HTTPException(status_code=400, detail="Provide id or source")
    try:
        if id is not None:
            removed = INDEX.remove_by_ids([id])
        else:
            removed = INDEX.remove_by_source(source)  # type: ignore[arg-type]
        return {"removed_count": removed}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete")


@app.post("/delete")
async def delete_item_post(req: DeleteRequest):
    if req.id is None and not req.source:
        raise HTTPException(status_code=400, detail="Provide id or source")
    try:
        if req.id is not None:
            removed = INDEX.remove_by_ids([req.id])
        else:
            removed = INDEX.remove_by_source(req.source or "")
        return {"removed_count": removed}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete")


@app.get("/index")
async def get_index(summary: bool = True, limit: int = 20):
    """Return index summary: count and a sample of stored metas."""
    try:
        count = INDEX.count()
        samples = INDEX.get_metas(limit=limit) if summary else []
        return {"count": count, "samples": samples}
    except Exception:
        return {"count": 0, "samples": []}


@app.get("/index_grouped")
async def get_index_grouped():
    """Return grouped summary by source with total chunk counts.

    Response: { items: [ { source, count }, ... ], total_sources, total_chunks }
    """
    try:
        from collections import defaultdict
        counts: dict[str, int] = defaultdict(int)
        # iterate all metas
        metas = INDEX.get_metas(limit=None)
        for m in metas:
            s = (m or {}).get('source') or ""
            counts[str(s)] += 1
        items = [ { "source": s, "count": c } for s, c in sorted(counts.items(), key=lambda kv: kv[0]) ]
        return { "items": items, "total_sources": len(items), "total_chunks": sum(counts.values()) }
    except Exception:
        return { "items": [], "total_sources": 0, "total_chunks": 0 }


@app.post("/query_stream")
async def query_stream(message: Message, k: int = 4, model: str | None = None, request: Request = None, session_id: str | None = None, persona: str | None = None, user_id: str | None = None):
    """Stream an LLM-generated answer as Server-Sent Events."""
    from .llm import stream_synthesize_answer  # local import to avoid overhead if unused
    # rate limit: streaming is costlier
    ip = request.client.host if request and request.client else "unknown"
    ok, retry_after, _ = rl_allow(ip, capacity=60, per_seconds=60, cost=10)
    if not ok:
        from fastapi import Response
        return Response(status_code=429, headers={"Retry-After": str(int(retry_after))}, content=f"Rate limit exceeded. Try again in {retry_after:.1f}s")
    results = INDEX.query(message.text, k=k)

    def event_gen():
        from .llm import stream_synthesize_answer
        full = []
        for token in stream_synthesize_answer(message.text, results, model_override=model, persona=persona, history=(MEMORY.get_history_messages(session_id, 5) if session_id else None)):
            full.append(token)
            yield token
        # after done, store turn
        if session_id:
            try:
                MEMORY.add_turn(session_id, message.text, "".join(full))
            except Exception:
                pass
        # analytics
        try:
            if user_id:
                record_query(user_id, llm_used=True)
        except Exception:
            pass

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.get("/query_stream_sse")
async def query_stream_sse(text: str, k: int = 4, model: str | None = None, request: Request = None, session_id: str | None = None, persona: str | None = None, user_id: str | None = None, fast: bool = False):
    """SSE-compliant streaming endpoint (GET) for EventSource clients."""
    from .llm import stream_synthesize_answer  # local import
    # rate limit: streaming is costlier
    ip = request.client.host if request and request.client else "unknown"
    ok, retry_after, _ = rl_allow(ip, capacity=60, per_seconds=60, cost=10)
    if not ok:
        from fastapi import Response
        return Response(status_code=429, headers={"Retry-After": str(int(retry_after))}, content=f"Rate limit exceeded. Try again in {retry_after:.1f}s")
    try:
        max_k = int(os.getenv("RAG_MAX_K", "6"))
    except Exception:
        max_k = 6
    results = INDEX.query(text, k=min(k, max_k))
    try:
        print(f"/query_stream_sse text='{text[:80]}' k={k} model={model} session_id={session_id} persona={persona}")
    except Exception:
        pass

    def sse_events():
        import json as _json
        # Optional: send a kick-off comment to keep some proxies open
        yield ": stream start\n\n"
        # Send citations metadata first
        citations = []
        for idx, r in enumerate(results, start=1):
            meta = r.get('meta') or {}
            preview = (meta.get('text') or '')[:200]
            citations.append({
                'n': idx,
                'source': meta.get('source'),
                'chunk': meta.get('chunk'),
                'score': r.get('score'),
                'preview': preview,
            })
        status = llm_status(model)
        meta_payload = {"citations": citations, "llm_ok": bool(status.get('ok')), "llm_model": status.get('model'), "llm_reason": status.get('reason')}
        yield "event: meta\n"
        yield f"data: {_json.dumps(meta_payload, ensure_ascii=False)}\n\n"
        from .llm import stream_synthesize_answer
        full = []
        hist = MEMORY.get_history_messages(session_id, 5) if session_id else None
        # In fast mode, reduce max_tokens for quicker first and overall response
        # Keep responses compact to reduce TPM usage
        max_toks = 256 if fast else int(os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "512"))
        for token in stream_synthesize_answer(text, results, model_override=model, persona=persona, history=hist, max_tokens=max_toks):
            full.append(token)
            # Each event is prefixed with 'data: '
            yield f"data: {token}\n\n"
        # Signal end of stream
        yield "event: done\n"
        yield "data: [DONE]\n\n"
        # store turn after streaming completes
        if session_id:
            try:
                MEMORY.add_turn(session_id, text, "".join(full))
            except Exception:
                pass
        # analytics
        try:
            if user_id:
                record_query(user_id, llm_used=True)
        except Exception:
            pass

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # disable buffering on some proxies
    }
    return StreamingResponse(sse_events(), media_type="text/event-stream", headers=headers)


@app.on_event("startup")
async def _warmup():
    """Warm up embeddings/model to reduce first-token latency."""
    try:
        _ = INDEX.query("warmup", k=1)
    except Exception:
        pass


@app.get("/profile")
async def profile(user_id: str | None = None, request: Request = None):
    """Return simple usage analytics for a user. If user_id missing, fall back to client IP."""
    if not user_id:
        # fallback to IP-based profile to avoid erroring out
        user_id = (request.client.host if request and request.client else "anonymous")
    try:
        return get_profile(user_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to fetch profile")


@app.get("/llm/health")
async def llm_health(mode: str = "quick", model: str | None = None):
    """Return LLM readiness. mode=quick checks env/SDK only; mode=deep performs a 1-token API call.

    Response example:
      { "quick": { ok, model, reason }, "deep": { ok, model, reason } }
    """
    quick = llm_status(model_override=model)
    out = {"quick": quick}
    if (mode or "").lower() in ("deep", "full", "probe"):
        out["deep"] = ping_llm(model_override=model)
    return out
