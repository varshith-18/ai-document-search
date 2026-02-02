from pypdf import PdfWriter
import httpx, os, pathlib

root = pathlib.Path(__file__).resolve().parents[1]
valid_pdf = root / 'valid.pdf'
# Create a minimal valid PDF with one blank page
writer = PdfWriter()
writer.add_blank_page(width=72, height=72)
with open(valid_pdf, 'wb') as f:
    writer.write(f)

base = os.environ.get('API', 'http://127.0.0.1:8001')
url = f"{base}/upload"
with open(valid_pdf, 'rb') as f:
    files = {'file': ('valid.pdf', f, 'application/pdf')}
    r = httpx.post(url, files=files, timeout=30)
print(r.status_code)
print(r.text)
