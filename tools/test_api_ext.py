import requests
import json
import time
import sys

# Configuration
BASE_URL = "http://localhost:3088"
API_KEY = "z-img-secret-key-2026"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def test_unauthorized():
    print("Testing unauthorized request...")
    resp = requests.post(f"{BASE_URL}/api/v1/generate", json={"prompt": "test"}, headers={})
    if resp.status_code == 401:
        print("✅ Unauthorized request correctly rejected.")
    else:
        print(f"❌ Unauthorized request failed. Status: {resp.status_code}")

def test_generate_and_poll():
    print("\nTesting generation and polling...")
    payload = {
        "prompt": "A futuristic city in the style of cyberpunk",
        "steps": 4,
        "width": 512,
        "height": 512
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/api/v1/generate", json=payload, headers=HEADERS)
        if resp.status_code != 202:
            print(f"❌ Job submission failed. Status: {resp.status_code}, Body: {resp.text}")
            return

        data = resp.json()
        job_id = data.get("job_id")
        print(f"✅ Job submitted successfully. Job ID: {job_id}")

        print("Polling for status...")
        attempts = 0
        while attempts < 30:
            status_resp = requests.get(f"{BASE_URL}/api/v1/status/{job_id}", headers=HEADERS)
            if status_resp.status_code != 200:
                print(f"❌ Status check failed. Status: {status_resp.status_code}")
                break
            
            status_data = status_resp.json()
            state = status_data.get("state")
            print(f"Current state: {state}")
            
            if state == "completed":
                print(f"✅ Job completed! Image URL: {status_data.get('image_url')}")
                return
            elif state == "failed":
                print(f"❌ Job failed: {status_data.get('error')}")
                return
            
            time.sleep(5)
            attempts += 1
            
        print("❌ Polling timed out.")
    except Exception as e:
        print(f"❌ Error during test: {str(e)}")

if __name__ == "__main__":
    # Check if server is reachable first
    try:
        requests.get(BASE_URL, timeout=2)
    except:
        print(f"❌ Error: Server not reachable at {BASE_URL}. Please make sure 'npm run dev' or 'node server.mjs' is running.")
        sys.exit(1)

    test_unauthorized()
    test_generate_and_poll()
