import json
import requests
import sys

prompt_id = sys.argv[1]
res = requests.get(f"http://127.0.0.1:8188/history/{prompt_id}")
data = res.json()
with open("history_dump.json", "w") as f:
    json.dump(data, f, indent=2)
print(f"History saved to history_dump.json")
