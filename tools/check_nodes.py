import requests
import os
import json
from dotenv import load_dotenv

load_dotenv()

COMFY_HOST = os.getenv("COMFY_HOST", "127.0.0.1:8188")
COMFY_URL = f"http://{COMFY_HOST}"

def check_nodes():
    print(f"Fetching node info from {COMFY_URL}/object_info...")
    try:
        response = requests.get(f"{COMFY_URL}/object_info", timeout=10)
        if response.status_code == 200:
            nodes = response.json()
            lora_nodes = [name for name in nodes.keys() if "Lora" in name or "GGUF" in name]
            print("Available LoRA/GGUF-related nodes:")
            for node in sorted(lora_nodes):
                print(f" - {node}")
            
            # Specifically check for common Flux/GGUF lora loaders
            targets = ["LoraLoaderGGUF", "FluxLoraLoader", "LoraLoader", "LoraLoaderModelOnly"]
            print("\nSpecific Check:")
            for t in targets:
                print(f" - {t}: {'EXISTS' if t in nodes else 'MISSING'}")
                
        else:
            print(f"Failed to fetch object_info. Status code: {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_nodes()
