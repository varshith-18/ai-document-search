# AI Document Search — RAG & LLM Technical Summary

Date: 2025-11-07

This document summarizes how the Retrieval-Augmented Generation (RAG) system works in this project, the LLM integration, index/storage choices, configuration, and operational notes. Use this as a reference for development, debugging, and operational changes.

## 1. High-level Architecture

- Frontend: React + Vite UI (upload, chat, settings, analytics). Uses SSE (EventSource) for streaming LLM answers.
- Backend: FastAPI service providing ingestion, retrieval, LLM synthesis, SSE streaming, and health/settings endpoints.
- Index/storage: Local vector index persisted under `backend/index/`.
- Embeddings: Prefer local `sentence-transformers` model; TF-IDF fallback using scikit-learn.
- Optional acceleration: Faiss if installed (for ANN search).

## 2. Key Components & Files

- `backend/app/llm.py` — LLM integration layer.

  - Uses modern OpenAI SDK (`from openai import OpenAI`) if available, with legacy `openai` fallback.
  - Exposes `synthesize_answer()` (non-stream) and `stream_synthesize_answer()` (streaming SSE) with graceful fallbacks.
  - Builds chat messages with persona presets and context-trimming logic.
  - `ping_llm()` and `llm_status()` for health probes.

- `backend/app/rag.py` — RAGIndex class.

  - Supports sentence-transformers embeddings + Faiss index if available.
  - TF-IDF + sklearn NearestNeighbors fallback when transformer/faiss missing or `RAG_FAST` set.
  - Persists `meta.json`, `embeddings.npy`, `faiss.index`, and `texts.json` inside `backend/index/`.

- `backend/app/main.py` — FastAPI endpoints.

  - `/upload` — PDF upload -> extract text (via `pypdf` or `PyPDF2`) -> chunk -> ingest.
  - `/ingest` — direct ingest of chunked texts and metas.
  - `/query` — retrieval; optional `use_llm=true` to synthesize via LLM.
  - `/query_stream` & `/query_stream_sse` — streaming endpoints returning incremental tokens and a `meta` event (citations).
  - `/index`, `/index_grouped`, `/delete` — index management and inspection.
  - `/llm/health` — quick/deep health checks.

- `backend/app/pdf_utils.py` — PDF extraction and sliding-window chunker (`chunk_size`, `overlap`).
- `backend/app/memory.py` — in-memory session memory for recent chat turns.
- `backend/app/rate_limit.py` — in-memory token-bucket per-IP rate limiter.
- `backend/index/` — stored index artifacts (meta, embeddings, faiss.index, texts.json).

## 3. RAG Pipeline (ingest → retrieve → synthesize)

1. Upload flow (`/upload`):
   - PDF -> extract text -> chunk_text(tokens based sliding window) -> build meta for each chunk: `{ source, chunk, text }` -> `INDEX.add_texts()`.
2. Indexing:
   - If `sentence-transformers` is installed (and `RAG_FAST` not set), embed with chosen `EMBED_MODEL` and (if faiss available) add to Faiss index.
   - Else TF-IDF vectorize full corpus and persist `embeddings.npy` for sklearn nearest neighbors.
3. Retrieval (`/query`):
   - `INDEX.query(query, k)` returns top-k nearest chunks (k clamped via `RAG_MAX_K`).
4. Synthesis (optional LLM):
   - `_build_messages()` constructs numbered context entries like `[1] ...` with per-chunk and overall char caps (`RAG_CONTEXT_CHARS_PER_CHUNK`, `RAG_CONTEXT_MAX_CHARS`).
   - Persona system prompts (concise, bullets, step-by-step, formal) guide tone and format.
   - `synthesize_answer()` non-stream or `stream_synthesize_answer()` for SSE streaming; streaming takes care not to split citation markers like `[12]`.
   - Graceful fallback: if LLM fails or missing key, return concatenated retrieved chunks with an explanatory prefix.

## 4. LLM / Provider Details

- Primary: OpenAI chat completion APIs.
  - Prefers modern SDK: `from openai import OpenAI` (v1+). Legacy `openai` library supported.
  - Model selected via `OPENAI_MODEL` env var (default in code: `gpt-3.5-turbo-0125` / `gpt-3.5-turbo`).
  - API key: `OPENAI_API_KEY`.
- Anthropic: SDK exists in the venv but project doesn't currently call Anthropic — adapter would be required to map messages and streaming behavior.
- Embeddings: Local `sentence-transformers` by default (`EMBED_MODEL` env var). Optionally implement OpenAI Embeddings to use hosted vectors (not currently implemented).

## 5. Configuration & Env Variables

Important env vars (defaults shown in code):

- `OPENAI_API_KEY` — required for LLM synthesize.
- `OPENAI_MODEL` — model name for chat completions (default: `gpt-3.5-turbo-0125` in code).
- `EMBED_MODEL` — embedding model (default: `sentence-transformers/all-MiniLM-L6-v2`).
- `RAG_CONTEXT_CHARS_PER_CHUNK` — default `800` (chars per chunk included in prompt).
- `RAG_CONTEXT_MAX_CHARS` — default `5000` (total context chars limit).
- `RAG_MAX_K` — default `6` (cap top-k retrieval).
- `OPENAI_MAX_OUTPUT_TOKENS` — default `512` (used for streaming endpoint).
- `RAG_FAST` — if `1` uses TF-IDF path even if transformers are installed.

Place these in a `.env` file either at repo root or in `backend/.env` (the app loads both).

## 6. Error Handling & Rate-Limit

- LLM errors: code catches exceptions and returns context-only fallback; rate-limit errors are surfaced with clearer messages for streaming endpoints.
- Rate-limiting: in-memory token-bucket per-IP; returns HTTP 429 with `Retry-After` when exceeded.
- PDF parsing requires `pypdf` or `PyPDF2`.

## 7. Operational Notes & Recommendations

- Cost control:
  - Keep `RAG_CONTEXT_*` conservative; cap `k` via `RAG_MAX_K`.
  - Gate LLM usage behind auth or stricter rate-limits.
- Scalability:
  - Current in-memory rate-limiter and session memory are not multi-process; use Redis for production.
  - Replace local Faiss/TF-IDF with a managed vector DB (Pinecone/Milvus) for large datasets or multi-instance deployments.
- Observability:
  - Add metrics (latency, error rate, tokens consumed) to Prometheus/cloud for monitoring.
- Robustness:
  - Add retries/backoff for LLM calls; cache embeddings/index results where useful.

## 8. How to run a quick local demo

1. Create and activate a Python venv and install `backend/requirements-rag.txt`.
2. Create `.env` with `OPENAI_API_KEY` and optional `EMBED_MODEL` / `DEFAULT_REPO`.
3. Start backend (from repo root):

```powershell
# example (adjust path if you run from backend folder)
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

4. Use the frontend or curl to upload and query; e.g. POST `/upload` with a PDF, then POST `/query` with `{"text":"Your question"}` and `?use_llm=true`.

## 9. Where to change behavior (quick pointers)

- Change LLM model: modify `OPENAI_MODEL` in `.env` or change default in `llm.py`.
- Use TF-IDF always: set `RAG_FAST=1` in `.env`.
- Adjust prompt trimming: `RAG_CONTEXT_CHARS_PER_CHUNK`, `RAG_CONTEXT_MAX_CHARS`.
- Increase/decrease default `OPENAI_MAX_OUTPUT_TOKENS` for streaming responses.

---

If you want a Word document (`.docx`) I can:

- Option A: Convert this Markdown to `.docx` using `pandoc` (local) — command I can provide.
- Option B: Generate a `.docx` file in the repo using a small Python script (requires `python-docx`). I can create that script and run it if you want.

Tell me which you prefer and I will either run the conversion or add the script & produce the `.docx` file for you.
