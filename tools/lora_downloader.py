import requests
import os
import sys
import hashlib
import json
from urllib.parse import urlparse

def download_lora(url, target_dir):
    try:
        if not os.path.exists(target_dir):
            os.makedirs(target_dir)
        
        # Generate a filename from URL if not obvious
        parsed_url = urlparse(url)
        filename = os.path.basename(parsed_url.path)
        if not filename or not (filename.endswith('.safetensors') or filename.endswith('.ckpt') or filename.endswith('.bin')):
            # Simple hash if filename is weird
            filename = f"lora_{hashlib.md5(url.encode()).hexdigest()}.safetensors"
        
        target_path = os.path.join(target_dir, filename)
        
        if os.path.exists(target_path):
            return {"success": True, "filename": filename, "path": target_path, "message": "LoRA already exists"}
        
        response = requests.get(url, stream=True, timeout=300)
        response.raise_for_status()
        
        with open(target_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        return {"success": True, "filename": filename, "path": target_path, "message": "Successfully downloaded"}
    except Exception as e:
        if 'target_path' in locals() and os.path.exists(target_path):
            os.remove(target_path)
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: python lora_downloader.py <url> <target_dir>"}))
        sys.exit(1)
    
    result = download_lora(sys.argv[1], sys.argv[2])
    print(json.dumps(result))
