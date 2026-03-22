import os
import json
import time
import asyncio
import urllib.request
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any

class ProxyManager:
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.proxies_file = os.path.join(base_dir, "proxies.txt")
        self.status_file = os.path.join(base_dir, "proxies_status.json")
        self.is_verifying = False
        self._status = self._load_status()
        self._lock = threading.Lock()

    def _load_status(self) -> Dict[str, Any]:
        if os.path.exists(self.status_file):
            try:
                with open(self.status_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {"total": 0, "processed": 0, "valid": 0, "last_verified": None, "working_proxies": []}

    def _save_status(self, force=False):
        # Throttle saves to disk to avoid excessive I/O
        # Only save every 20 processed proxies unless forced
        if not force and self.is_verifying and self._status.get("processed", 0) > 0:
            if self._status["processed"] % 20 != 0:
                return

        with open(self.status_file, 'w') as f:
            json.dump(self._status, f)

    def get_status(self) -> Dict[str, Any]:
        return self._status

    async def fetch_free_proxies(self):
        url = "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text"
        try:
            # Use urllib to fetch
            with urllib.request.urlopen(url, timeout=10) as response:
                content = response.read().decode('utf-8')
                with open(self.proxies_file, 'w') as f:
                    f.write(content)
                self._status["total"] = len([l for l in content.splitlines() if l.strip()])
                self._save_status()
                return True
        except Exception as e:
            print(f"Error fetching proxies: {e}")
            return False

    def _test_proxy(self, proxy: str) -> bool:
        test_url = "https://www.youtube.com"
        try:
            proxy_support = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
            opener = urllib.request.build_opener(proxy_support)
            # Short timeout for verification
            with opener.open(test_url, timeout=5) as response:
                return response.status == 200
        except:
            return False

    async def verify_proxies(self):
        if self.is_verifying:
            return
        
        if not os.path.exists(self.proxies_file):
            return

        self.is_verifying = True
        
        def run_verification():
            with open(self.proxies_file, 'r') as f:
                proxies = [l.strip() for l in f if l.strip()]
            
            self._status["total"] = len(proxies)
            self._status["processed"] = 0
            self._status["valid"] = 0
            self._status["working_proxies"] = []
            self._save_status(force=True)

            # Test the full list now that we have multi-threading
            to_test = proxies
            valid_proxies = []

            def test_and_update(p):
                success = self._test_proxy(p)
                with self._lock:
                    self._status["processed"] += 1
                    if success:
                        valid_proxies.append(p)
                        self._status["valid"] = len(valid_proxies)
                    self._save_status() # Throttled inside

            # Using 50 threads for high speed
            with ThreadPoolExecutor(max_workers=50) as executor:
                executor.map(test_and_update, to_test)

            with self._lock:
                self._status["working_proxies"] = valid_proxies
                self._status["last_verified"] = int(time.time())
                self._status["total"] = len(proxies)
                self.is_verifying = False
                self._save_status(force=True)

        # Run the entire verification process in a background thread
        threading.Thread(target=run_verification).start()

    def delete_proxies(self):
        self.is_verifying = False # Interrupt if possible
        if os.path.exists(self.proxies_file):
            try: os.remove(self.proxies_file)
            except: pass
        if os.path.exists(self.status_file):
            try: os.remove(self.status_file)
            except: pass
        
        with self._lock:
            self._status = {"total": 0, "processed": 0, "valid": 0, "last_verified": None, "working_proxies": []}
            # No need to save as we just deleted the file
