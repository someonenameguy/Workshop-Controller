"""
Persistent cache for Steam Workshop metadata (title, preview_url, tags, time_updated).
Stored at data/workshop_cache.json.
"""

from pathlib import Path
from typing import Dict, List, Optional
import json
import threading

from src.core.config import DATA_DIR

CACHE_FILE = DATA_DIR / "workshop_cache.json"


class MetadataCache:
    """Thread-safe persistent cache for Steam Workshop item metadata."""

    def __init__(self, cache_path: Optional[Path] = None):
        self.cache_path = cache_path or CACHE_FILE
        self._lock = threading.RLock()
        self._cache: Dict[str, dict] = {}
        self.load()

    def _normalize_entry(self, data: dict) -> dict:
        tags = data.get("tags") or []
        if isinstance(tags, str):
            tags = [tags]
        elif not isinstance(tags, list):
            tags = list(tags)

        return {
            "title": str(data.get("title", "") or ""),
            "preview_url": str(data.get("preview_url", "") or ""),
            "tags": [str(t) for t in tags],
            "time_updated": int(data.get("time_updated", 0) or 0),
        }

    def load(self) -> None:
        """Load cache from disk."""
        with self._lock:
            if self.cache_path.exists():
                try:
                    with open(self.cache_path, "r", encoding="utf-8") as f:
                        raw = json.load(f)
                    if isinstance(raw, dict):
                        self._cache = {
                            str(k): self._normalize_entry(v if isinstance(v, dict) else {})
                            for k, v in raw.items()
                        }
                    else:
                        self._cache = {}
                except Exception as e:
                    print(f"[MetadataCache] Failed to load {self.cache_path}: {e}")
                    self._cache = {}
            else:
                self._cache = {}

    def save(self) -> None:
        """Save cache to disk atomically."""
        with self._lock:
            try:
                self.cache_path.parent.mkdir(parents=True, exist_ok=True)
                tmp_path = self.cache_path.with_suffix(".tmp")
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(self._cache, f, indent=2)
                tmp_path.replace(self.cache_path)
            except Exception as e:
                print(f"[MetadataCache] Failed to save {self.cache_path}: {e}")

    def get(self, file_id: str) -> Optional[dict]:
        """Get cached metadata for a Workshop ID."""
        with self._lock:
            entry = self._cache.get(str(file_id))
            if entry is not None:
                return dict(entry)
            return None

    def set(self, file_id: str, data: dict) -> None:
        """Set cached metadata for a Workshop ID and save to disk."""
        with self._lock:
            self._cache[str(file_id)] = self._normalize_entry(data)
            self.save()

    def batch_get(self, file_ids: List[str]) -> Dict[str, dict]:
        """Get metadata for multiple Workshop IDs."""
        with self._lock:
            results = {}
            for fid in file_ids:
                entry = self._cache.get(str(fid))
                if entry is not None:
                    results[str(fid)] = dict(entry)
            return results

    def batch_set(self, items: Dict[str, dict]) -> None:
        """Set metadata for multiple Workshop IDs and save to disk."""
        with self._lock:
            for fid, data in items.items():
                self._cache[str(fid)] = self._normalize_entry(data)
            self.save()


metadata_cache = MetadataCache()
