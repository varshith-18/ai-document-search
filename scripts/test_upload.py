import httpx, os, pathlib
root = pathlib.Path(__file__).resolve().parents[1]
test_pdf = root / 'test.pdf'
# Minimal valid-ish PDF bytes
pdf_bytes = (b"%PDF-1.1\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
             b"2 0 obj\n<< /Type /Pages /Count 0 >>\nendobj\n"
             b"xref\n0 3\n0000000000 65535 f \n0000000015 00000 n \n0000000077 00000 n \n"
             b"trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n140\n%%EOF\n")
with open(test_pdf, 'wb') as f:
    f.write(pdf_bytes)

base = os.environ.get('API', 'http://127.0.0.1:8001')
url = f"{base}/upload"
with open(test_pdf, 'rb') as f:
    files = {'file': ('test.pdf', f, 'application/pdf')}
    r = httpx.post(url, files=files, timeout=30)
print(r.status_code)
print(r.text)
