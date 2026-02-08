#!/usr/bin/env python3
"""Test Ollama connection via Cloudflare tunnel"""
import requests

TOKEN = "a34ec7e79a52319d3ba5223cd0d6e2e8ff959bb14645dea6bc000d7f92ad22cb"
BASE = "https://chairs-witch-potato-thousand.trycloudflare.com"

def test_llama4():
    print(f"Testing Ollama connection to: {BASE}")
    print(f"Using token: {TOKEN[:20]}...")
    
    s = requests.Session()

    # 1) Bootstrap session cookie using the token URL
    print("\n1. Bootstrapping session with token...")
    try:
        r = s.get(f"{BASE}/", params={"token": TOKEN}, timeout=60)
        r.raise_for_status()
        print("✅ Session bootstrapped successfully")
    except Exception as e:
        print(f"❌ Session bootstrap failed: {e}")
        return

    # 2) Call Ollama generate (cookie automatically included)
    print("\n2. Testing Ollama text generation...")
    payload = {
        "model": "llama4:scout",
        "prompt": "who are you and what is your name?",
        "stream": False
    }

    try:
        r = s.post(f"{BASE}/api/generate", json=payload, timeout=600)
        r.raise_for_status()
        data = r.json()
        print("✅ Ollama responded successfully")
        print(f"Model: {data.get('model')}")
        print(f"Response: {data.get('response')[:200]}...")
        print(f"Done: {data.get('done')}")
    except Exception as e:
        print(f"❌ Ollama generation failed: {e}")
        return

if __name__ == "__main__":
    test_llama4()
