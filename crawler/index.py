"""
crawler/index.py — HTTP service entrypoint for Vercel
Handles:
  GET  /health  -> Service health check
  POST /refresh -> Refresh manifests for stale video IDs
  POST /crawl   -> Trigger targeted platform crawls
"""

from http.server import BaseHTTPRequestHandler
import json
import logging
from urllib.parse import urlparse
from datetime import datetime, timezone
import requests

from .common import (
    extract,
    SB_HEADERS,
    SUPABASE_URL,
)

log = logging.getLogger("crawler.service")


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/health", "/api/health"):
            self._send_json(200, {
                "ok": True,
                "service": "crawler",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        content_len = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            payload = json.loads(body_bytes.decode("utf-8") or "{}")
        except Exception:
            payload = {}

        if parsed.path in ("/refresh", "/api/refresh"):
            video_ids = payload.get("video_ids", [])
            refreshed = 0
            if video_ids and SUPABASE_URL:
                for vid_id in video_ids[:10]:
                    try:
                        r = requests.get(
                            f"{SUPABASE_URL}/rest/v1/video_catalog",
                            headers=SB_HEADERS,
                            params={"id": f"eq.{vid_id}", "select": "canonical_url", "limit": 1},
                            timeout=10,
                        )
                        if r.status_code == 200 and r.json():
                            url = r.json()[0]["canonical_url"]
                            info = extract(url)
                            if info and (info.get("manifest_url") or info.get("direct_mp4_url")):
                                now = datetime.now(timezone.utc).isoformat()
                                requests.patch(
                                    f"{SUPABASE_URL}/rest/v1/video_catalog?id=eq.{vid_id}",
                                    headers=SB_HEADERS,
                                    json={
                                        "manifest_url": info.get("manifest_url"),
                                        "direct_mp4_url": info.get("direct_mp4_url"),
                                        "manifest_refreshed_at": now,
                                    },
                                    timeout=10,
                                )
                                refreshed += 1
                    except Exception as e:
                        log.error("Failed to refresh %s: %s", vid_id, e)

            self._send_json(200, {"ok": True, "refreshed": refreshed, "total_requested": len(video_ids)})

        elif parsed.path in ("/crawl", "/api/crawl"):
            platforms = payload.get("platforms", ["archive", "peertube"])
            from .run_all import run
            try:
                run(platforms=platforms)
                self._send_json(200, {"ok": True, "message": f"Crawled platforms: {platforms}"})
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})

        else:
            self._send_json(404, {"error": "Not found"})
