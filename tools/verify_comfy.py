import requests
import os
from dotenv import load_dotenv

load_dotenv()

COMFY_HOST = os.getenv("COMFY_HOST", "127.0.0.1:8188")
COMFY_URL = f"http://{COMFY_HOST}"

def verify_connection():
    print(f"Verifying connection to ComfyUI at {COMFY_URL}...")
    try:
        response = requests.get(f"{COMFY_URL}/system_stats", timeout=5)
        if response.status_code == 200:
            print("Successfully connected to ComfyUI!")
            stats = response.json()
            print(f"System Stats: {stats}")
            return True
        else:
            print(f"Failed to connect. Status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"Error connecting to ComfyUI: {e}")
        return False

if __name__ == "__main__":
    verify_connection()
