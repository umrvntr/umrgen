import requests
import os
import json
from dotenv import load_dotenv

load_dotenv()

COMFY_HOST = os.getenv("COMFY_HOST", "127.0.0.1:8188")
COMFY_URL = f"http://{COMFY_HOST}"

def check_node():
    try:
        response = requests.get(f"{COMFY_URL}/object_info", timeout=10)
        if response.status_code == 200:
            nodes = response.json()
            t = "UnetLoaderGGUF"
            if t in nodes:
                print(f"\nNode: {t}")
                print(f"Outputs: {json.dumps(nodes[t].get('output', []), indent=2)}")
            else:
                print(f"\nNode: {t} MISSING")
        else:
            print(f"Failed. Status: {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_node()
