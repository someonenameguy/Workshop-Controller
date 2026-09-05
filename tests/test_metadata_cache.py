import pytest
from pathlib import Path
from src.core.metadata_cache import MetadataCache


def test_metadata_cache_crud(tmp_path):
    cache_file = tmp_path / "workshop_cache.json"
    cache = MetadataCache(cache_path=cache_file)

    # Initially empty
    assert cache.get("1234567") is None
    assert cache.batch_get(["1234567", "7654321"]) == {}

    # Set single item
    cache.set("1234567", {
        "title": "Test Mod 1",
        "preview_url": "https://example.com/1.png",
        "tags": ["1.4", "1.5"],
        "time_updated": 1700000000,
    })

    item = cache.get("1234567")
    assert item is not None
    assert item["title"] == "Test Mod 1"
    assert item["preview_url"] == "https://example.com/1.png"
    assert item["tags"] == ["1.4", "1.5"]
    assert item["time_updated"] == 1700000000

    # Ensure saved to disk
    assert cache_file.exists()

    # Load in new instance
    cache2 = MetadataCache(cache_path=cache_file)
    item2 = cache2.get("1234567")
    assert item2 == item


def test_metadata_cache_batch(tmp_path):
    cache_file = tmp_path / "workshop_cache.json"
    cache = MetadataCache(cache_path=cache_file)

    items = {
        "100": {"title": "Mod 100", "preview_url": "url1", "tags": ["tag1"], "time_updated": 100},
        "200": {"title": "Mod 200", "preview_url": "url2", "tags": ["tag2"], "time_updated": 200},
    }
    cache.batch_set(items)

    res = cache.batch_get(["100", "200", "300"])
    assert len(res) == 2
    assert "100" in res and res["100"]["title"] == "Mod 100"
    assert "200" in res and res["200"]["preview_url"] == "url2"
    assert "300" not in res
