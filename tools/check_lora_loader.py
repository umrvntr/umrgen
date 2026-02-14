import requests
import os
import json
import sys
from dotenv import load_dotenv

load_dotenv()

COMFY_HOST = os.getenv("COMFY_HOST", "127.0.0.1:8188")
COMFY_URL = f"http://{COMFY_HOST}"

def check_nodes(pattern):
    results = {}
    try:
        response = requests.get(f"{COMFY_URL}/object_info", timeout=15)
        if response.status_code == 200:
            all_nodes = response.json()
            matches = [name for name in all_nodes.keys() if pattern.lower() in name.lower()]
            print(f"Found {len(matches)} nodes matching '{pattern}'")
            for node_name in matches:
                results[node_name] = all_nodes[node_name]
            
            output_file = f"nodes_info_{pattern.lower()}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(results, f, indent=2)
            print(f"Saved results to {output_file}")
        else:
            print(f"Failed. Status: {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    pattern = sys.argv[1] if len(sys.argv) > 1 else "GGUF"
    check_nodes(pattern)
