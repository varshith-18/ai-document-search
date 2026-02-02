import sys, os, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from dotenv import load_dotenv
load_dotenv(str(ROOT / 'backend' / '.env'))
from app.llm import llm_status, ping_llm
print(json.dumps({'quick': llm_status(), 'deep': ping_llm()}, indent=2))
