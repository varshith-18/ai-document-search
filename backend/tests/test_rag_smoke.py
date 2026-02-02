from backend.app.rag import RAGIndex


def run_smoke():
    idx = RAGIndex()
    # clear any existing (for test keep separate index path) - we'll just ingest small texts
    texts = ["The capital of France is Paris.", "Python is a programming language."]
    metas = [{"source": "fact1"}, {"source": "fact2"}]
    idx.add_texts(texts, metas)
    res = idx.query("Where is the capital of France?", k=2)
    print('results:', res)


if __name__ == '__main__':
    run_smoke()
