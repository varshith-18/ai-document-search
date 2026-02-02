AI Document Search (RAG Chatbot)

What: Chat with PDFs using LLM + semantic search
Stack:

- Frontend: React (Vite) + Tailwind
- Backend: FastAPI (SSE streaming)
- AI: OpenAI Chat Completions (streaming); TF‑IDF fallback for retrieval; optional sentence-transformers + FAISS
- Deploy: Docker; static frontend can be served by any web server

What’s new:

- Chat UI with streaming responses and per-turn citations
- Session memory (last 5 turns) via session_id
- Persona selector (concise, bullets, step‑by‑step, formal) that tweaks tone and format
- LLM readiness banner when API key is missing/invalid

Quick start (backend):

- Create a virtualenv and install requirements:
  python -m venv .venv
  .venv\\Scripts\\Activate.ps1
  pip install -r backend/requirements.txt
- Run locally:
  uvicorn backend.app.main:app --reload --port 8000

Quick start (frontend):

- In a separate terminal:

  npm install --prefix frontend --no-audit --no-fund
  npm run --prefix frontend dev

Then open http://localhost:5173

Docker:
docker compose up --build

Notes:

- This is a starter scaffold. Implement RAG logic in `backend/app/main.py` and add environment variables for API keys.

RAG POC:

- A proof-of-concept RAG implementation is in `backend/app/rag.py`.
- It uses `sentence-transformers` + `faiss` when available. If those aren't installed (common on Windows), it falls back to a TF-IDF + sklearn NearestNeighbors implementation so you can try the pipeline quickly.
- To run a quick smoke test (ingest + query):

  python -m pip install -r backend/requirements.txt
  python backend/tests/test_rag_smoke.py

Note: the TF-IDF fallback is only for demos. For production, install sentence-transformers and faiss (or use a managed vector DB like Pinecone), and hook an LLM to produce final answers.

Session memory & persona:

- The frontend generates a session_id and sends it with each query; the backend keeps the last 5 user/assistant turns in memory and prepends them to LLM prompts.
- Use the Persona dropdown to select tone/output style: Concise (default), Bullet points, Step‑by‑step, or Formal.

Windows tips:

- Start backend and frontend in separate PowerShell terminals for reliability.
- If SSE appears to connect but no tokens arrive, check that your OPENAI_API_KEY is set in .env and that the selected model is available to your key.
