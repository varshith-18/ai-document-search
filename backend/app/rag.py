import os
import json
import importlib
from typing import List, Any

import numpy as np

# Optional dependencies: prefer to resolve at runtime to avoid editor diagnostics when not installed.
_SentenceTransformer: Any | None = None
_HAS_SENTE = False
try:
    _st_mod: Any = importlib.import_module("sentence_transformers")
    _SentenceTransformer = getattr(_st_mod, "SentenceTransformer", None)
    _HAS_SENTE = _SentenceTransformer is not None
except Exception:
    _SentenceTransformer = None
    _HAS_SENTE = False

_faiss: Any | None = None
_HAS_FAISS = False
try:
    _faiss = importlib.import_module("faiss")
    _HAS_FAISS = True
except Exception:
    _faiss = None
    _HAS_FAISS = False
    # sklearn fallback when faiss is not available
    from sklearn.neighbors import NearestNeighbors
    from sklearn.feature_extraction.text import TfidfVectorizer

INDEX_PATH = os.path.join(os.path.dirname(__file__), "..", "index")
EMBED_MODEL_NAME = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

os.makedirs(INDEX_PATH, exist_ok=True)


class RAGIndex:
    """RAG index with Faiss if available, otherwise a sklearn NearestNeighbors fallback.

    The class persists embeddings (for sklearn) or faiss index file plus a meta.json mapping.
    """

    def __init__(self, model_name: str = EMBED_MODEL_NAME):
        # Fast mode can force TF-IDF even if sentence-transformers is available
        fast_mode = os.getenv("RAG_FAST", "0") in ("1", "true", "True")
        # Use sentence-transformers if present and not in fast mode, otherwise TF-IDF fallback
        if (not fast_mode) and _HAS_SENTE and _SentenceTransformer is not None:
            self.model = _SentenceTransformer(model_name)
            self._use_tfidf = False
        else:
            self.model = None
            self._use_tfidf = True
            self._tfidf = TfidfVectorizer()
        self.index_file = os.path.join(INDEX_PATH, "faiss.index")
        self.meta_file = os.path.join(INDEX_PATH, "meta.json")
        self.embeddings_file = os.path.join(INDEX_PATH, "embeddings.npy")
        self._load()

    def _load(self):
        # load meta if exists
        if os.path.exists(self.meta_file):
            with open(self.meta_file, "r", encoding="utf-8") as f:
                self.id_to_meta = json.load(f)
        else:
            self.id_to_meta = {}

        if _HAS_FAISS and os.path.exists(self.index_file):
            try:
                self.index = _faiss.read_index(self.index_file)  # type: ignore[union-attr]
                self._use_faiss = True
            except Exception:
                self.index = None
                self._use_faiss = False
        else:
            self.index = None
            self._use_faiss = False

        # sklearn fallback: load embeddings if present
        if not self._use_faiss and os.path.exists(self.embeddings_file):
            self.embeddings = np.load(self.embeddings_file)
            # try to load texts for tfidf
            self.texts_file = os.path.join(INDEX_PATH, "texts.json")
            if os.path.exists(self.texts_file):
                with open(self.texts_file, "r", encoding="utf-8") as f:
                    try:
                        self.texts = json.load(f)
                    except Exception:
                        self.texts = []
            else:
                self.texts = []
            # ensure TF-IDF vectorizer is fitted to existing corpus for query transforms
            try:
                if getattr(self, "_use_tfidf", False) and self.texts:
                    self._tfidf = TfidfVectorizer()
                    self._tfidf.fit(self.texts)
            except Exception:
                pass
            # build nn index
            self._build_sklearn()
        else:
            self.embeddings = None
            self.texts_file = os.path.join(INDEX_PATH, "texts.json")
            self.texts = []

    def _save_meta(self):
        with open(self.meta_file, "w", encoding="utf-8") as f:
            json.dump(self.id_to_meta, f, ensure_ascii=False, indent=2)

    def _ensure_faiss(self, dim: int):
        if self.index is None:
            self.index = _faiss.IndexFlatL2(dim)  # type: ignore[union-attr]
            self._use_faiss = True

    def _build_sklearn(self):
        if self.embeddings is None or len(self.embeddings) == 0:
            self.nn = None
        else:
            self.nn = NearestNeighbors(n_neighbors=min(10, len(self.embeddings)), metric='cosine')
            self.nn.fit(self.embeddings)

    def _save_texts(self):
        try:
            with open(self.texts_file, "w", encoding="utf-8") as f:
                json.dump(self.texts, f, ensure_ascii=False)
        except Exception:
            pass

    def add_texts(self, texts: List[str], metas: List[dict]):
        if len(texts) == 0:
            return
        if not self._use_tfidf:
            embeddings = self.model.encode(texts, convert_to_numpy=True)
            dim = embeddings.shape[1]
        else:
            # maintain a full corpus for TF-IDF so transforms are consistent
            # load existing texts and append
            existing_texts = getattr(self, 'texts', []) or []
            start_id = len(existing_texts)
            self.texts = existing_texts + texts
            # re-fit TF-IDF on full corpus
            self._tfidf = TfidfVectorizer()
            embeddings = self._tfidf.fit_transform(self.texts).toarray()
            dim = embeddings.shape[1]

        # if faiss available prefer faiss
        if _HAS_FAISS and not self._use_tfidf:
            self._ensure_faiss(dim)
            self.index.add(embeddings)
            # write faiss
            _faiss.write_index(self.index, self.index_file)  # type: ignore[union-attr]
        else:
            # embeddings here are the full-corpus embeddings; save them and rebuild nn
            self.embeddings = embeddings
            np.save(self.embeddings_file, self.embeddings)
            # save texts file
            self._save_texts()
            self._build_sklearn()

        # assign metas: ensure keys are strings for JSON
        if not self._use_tfidf:
            start_id = len([k for k in self.id_to_meta.keys() if k != 'dim'])
        else:
            # when using tfidf we appended to texts; the new ids start at previous length
            start_id = start_id if 'start_id' in locals() else 0
        for i, m in enumerate(metas):
            # ensure chunk text is available in meta for LLM context
            meta = dict(m) if isinstance(m, dict) else {"source": str(m)}
            # if the texts list exists and we're in TF-IDF mode, use the stored text
            if self._use_tfidf:
                try:
                    meta_text = self.texts[start_id + i]
                except Exception:
                    meta_text = None
            else:
                # when not tfidf, we received 'texts' parameter originally; assume caller provided text in meta if needed
                meta_text = meta.get('text')
            if meta_text:
                meta['text'] = meta_text
            self.id_to_meta[str(start_id + i)] = meta
        # save meta and dim
        self.id_to_meta["dim"] = int(dim)
        self._save_meta()

    # ---- Removal & rebuild helpers ----
    def _rebuild_from_metas(self, kept_metas: list[dict]):
        """Rebuild index from kept metas. Requires 'text' in each meta for faiss backend.

        For TF-IDF fallback, we rebuild texts corpus and vectorizer.
        """
        # Rewrite id_to_meta with contiguous ids
        new_id_to_meta: dict[str, dict] = {}
        texts: list[str] = []
        for new_id, meta in enumerate(kept_metas):
            m = dict(meta) if isinstance(meta, dict) else {}
            # Collect text if available
            t = m.get('text')
            if t:
                texts.append(t)
            new_id_to_meta[str(new_id)] = m

        if not self._use_tfidf:
            # For sentence-transformers + faiss path, we need texts
            if len(texts) != len(kept_metas):
                raise ValueError("Cannot rebuild: missing text in metas; re-ingest required")
            embeddings = self.model.encode(texts, convert_to_numpy=True)
            dim = embeddings.shape[1]
            # write faiss or sklearn emb as needed
            if _HAS_FAISS:
                self._ensure_faiss(dim)
                # create a fresh index
                self.index = _faiss.IndexFlatL2(dim)  # type: ignore[union-attr]
                self.index.add(embeddings)
                _faiss.write_index(self.index, self.index_file)  # type: ignore[union-attr]
                self.embeddings = None
            else:
                self.embeddings = embeddings
                np.save(self.embeddings_file, self.embeddings)
                self._build_sklearn()
            # clear TF-IDF artifacts since not in use
            self.texts = []
            try:
                if os.path.exists(self.texts_file):
                    os.remove(self.texts_file)
            except Exception:
                pass
            new_id_to_meta['dim'] = int(dim)
            self.id_to_meta = new_id_to_meta
            self._save_meta()
            return len(kept_metas)

        # TF-IDF fallback: rebuild texts and embeddings
        self.texts = [m.get('text', '') for m in kept_metas]
        self._tfidf = TfidfVectorizer()
        if self.texts:
            emb = self._tfidf.fit_transform(self.texts).toarray()
        else:
            emb = np.empty((0, 0))
        self.embeddings = emb
        np.save(self.embeddings_file, self.embeddings)
        self._save_texts()
        self._build_sklearn()
        new_id_to_meta['dim'] = int(emb.shape[1] if emb is not None and emb.size else 0)
        self.id_to_meta = new_id_to_meta
        self._save_meta()
        return len(kept_metas)

    def remove_by_ids(self, ids: List[int]) -> int:
        """Remove items by exact integer ids. Returns count removed."""
        ids_set = set(int(i) for i in ids)
        kept = []
        before = 0
        for k, v in self.id_to_meta.items():
            if k == 'dim':
                continue
            try:
                idx = int(k)
            except Exception:
                continue
            before += 1
            if idx in ids_set:
                continue
            kept.append(v)
        after = self._rebuild_from_metas(kept)
        return int(before - after)

    def remove_by_source(self, source: str) -> int:
        """Remove all items whose meta.source matches the given source string."""
        kept = []
        before = 0
        for k, v in self.id_to_meta.items():
            if k == 'dim':
                continue
            s = (v or {}).get('source')
            before += 1
            if s == source:
                continue
            kept.append(v)
        after = self._rebuild_from_metas(kept)
        return int(before - after)

    def query(self, text: str, k: int = 4):
        # obtain embedding for query depending on backend
        if not self._use_tfidf:
            emb = self.model.encode([text], convert_to_numpy=True)
        else:
            # If no corpus ingested or vectorizer not fitted, there is nothing to search
            if not getattr(self, 'texts', None):
                return []
            # Fit lazily if needed (e.g., after restart)
            if not hasattr(self._tfidf, 'vocabulary_'):
                try:
                    self._tfidf.fit(self.texts)
                except Exception:
                    return []
            emb = self._tfidf.transform([text]).toarray()
        results = []
        if self._use_faiss and self.index is not None:
            D, I = self.index.search(emb, k)
            for dist, idx in zip(D[0], I[0]):
                if idx < 0:
                    continue
                meta = self.id_to_meta.get(str(idx)) or self.id_to_meta.get(idx)
                results.append({"score": float(dist), "meta": meta})
            return results

        # sklearn fallback
        if self.embeddings is None or getattr(self, 'nn', None) is None:
            return []
        distances, indices = self.nn.kneighbors(emb, n_neighbors=min(k, len(self.embeddings)))
        for dist, idx in zip(distances[0], indices[0]):
            meta = self.id_to_meta.get(str(idx))
            results.append({"score": float(dist), "meta": meta})
        return results

    def get_metas(self, limit: int | None = None):
        """Return list of stored metas (as dicts). If limit is set, return that many."""
        # id_to_meta stores numeric keys as strings and a 'dim' key
        metas = []
        for k, v in self.id_to_meta.items():
            if k == 'dim':
                continue
            try:
                idx = int(k)
            except Exception:
                continue
            metas.append({"id": idx, **(v or {})})
        metas.sort(key=lambda x: x.get('id', 0))
        if limit is not None:
            return metas[:limit]
        return metas

    def count(self):
        """Return number of indexed chunks."""
        return len([k for k in self.id_to_meta.keys() if k != 'dim'])
