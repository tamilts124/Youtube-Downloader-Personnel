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
        return {"total": 0, "processed": 0, "valid": 0, "last_verified": None, "working_proxies": [], "proxy_latencies": {}}

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

    def get_random_proxy(self, exclude: list = None) -> str:
        """Helper to get the fastest working proxy, optionally excluding some."""
        with self._lock:
            working = self._status.get("working_proxies", [])
            latencies = self._status.get("proxy_latencies", {})
            if not working:
                return None
            
            # Filter out excluded ones
            options = working
            if exclude:
                options = [p for p in working if p not in exclude]
            
            if not options:
                return None
                
            # If we have latencies, sort by them (Fastest First)
            if latencies:
                # Filter latencies to only include our current options
                valid_options = [p for p in options if p in latencies]
                if valid_options:
                    # Sort by recorded latency
                    valid_options.sort(key=lambda p: latencies[p])
                    return valid_options[0] # Return the fastest available
            
            # Fallback to random if no latency data or unexpected structure
            import random
            return random.choice(options)

    def mark_failed(self, proxy: str):
        """Immediately removes a failed proxy from the working list."""
        with self._lock:
            working = self._status.get("working_proxies", [])
            if proxy in working:
                working.remove(proxy)
                self._status["valid"] = len(working)
                self._save_status(force=True)
                print(f"DEBUG: Proxy {proxy} marked as failed and removed.")

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

    def _test_proxy(self, proxy: str) -> tuple:
        """Tests a proxy and returns (success: bool, latency: float)"""
        test_url = "https://www.youtube.com"
        start_time = time.time()
        try:
            proxy_support = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
            opener = urllib.request.build_opener(proxy_support)
            # Short timeout for verification
            with opener.open(test_url, timeout=5) as response:
                latency = time.time() - start_time
                return response.status == 200, latency
        except:
            return False, 999.0

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
            self._status["proxy_latencies"] = {}
            self._save_status(force=True)

            # Test the full list now that we have multi-threading
            to_test = proxies
            
            def test_and_update(p):
                success, latency = self._test_proxy(p)
                with self._lock:
                    self._status["processed"] += 1
                    if success:
                        if p not in self._status["working_proxies"]:
                            self._status["working_proxies"].append(p)
                        self._status["proxy_latencies"][p] = latency
                        self._status["valid"] = len(self._status["working_proxies"])
                    self._save_status() # Throttled inside

            # Using 50 threads for high speed
            with ThreadPoolExecutor(max_workers=50) as executor:
                # We consume the map to ensure all tasks are submitted
                list(executor.map(test_and_update, to_test))

            with self._lock:
                # Final sort by latency before marking finished
                self._status["working_proxies"].sort(key=lambda p: self._status["proxy_latencies"].get(p, 999.0))
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
