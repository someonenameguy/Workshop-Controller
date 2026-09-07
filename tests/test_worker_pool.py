import asyncio
import pytest
from src.core.worker_pool import DownloadItem, WorkerPool, WorkerState


@pytest.mark.asyncio
async def test_worker_pool_queue_and_cancel():
    pool = WorkerPool()

    # Add dummy item to items map
    item = DownloadItem(
        mod_id="123456789",
        title="Test Mod",
        status="queued",
    )
    pool.items["123456789"] = item

    queue_status = pool.get_queue_status()
    assert len(queue_status) == 1
    assert queue_status[0]["mod_id"] == "123456789"
    assert queue_status[0]["status"] == "queued"

    # Cancel item
    cancelled = await pool.cancel_download("123456789")
    assert cancelled is True
    assert pool.items["123456789"].status == "cancelled"


@pytest.mark.asyncio
async def test_worker_pool_event_broadcasting():
    pool = WorkerPool()
    events = []

    def listener(event):
        events.append(event)

    pool.subscribe(listener)
    await pool.broadcast("test_event", {"hello": "world"})

    assert len(events) == 1
    assert events[0]["type"] == "test_event"
    assert events[0]["data"] == {"hello": "world"}

    pool.unsubscribe(listener)
    await pool.broadcast("second_event", {})
    assert len(events) == 1  # Unsubscribed, no new event received


@pytest.mark.asyncio
async def test_worker_pool_retry_single_item():
    pool = WorkerPool()

    # Non-existent item
    assert await pool.retry_download("999999") is False

    # Failed item
    item = DownloadItem(
        mod_id="123456789",
        title="Failed Mod",
        status="failed",
        error="Network error",
        retry_count=2,
    )
    pool.items["123456789"] = item

    # Should successfully retry
    retried = await pool.retry_download("123456789")
    assert retried is True
    assert item.status == "queued"
    assert item.progress == 0
    assert item.error is None
    assert item.retry_count == 0
    assert not pool.queue.empty()
    queued_item = await pool.queue.get()
    assert queued_item.mod_id == "123456789"

    # Cannot retry an active item
    item.status = "downloading"
    assert await pool.retry_download("123456789") is False


@pytest.mark.asyncio
async def test_worker_pool_retry_all_failed():
    pool = WorkerPool()

    item1 = DownloadItem(mod_id="111", title="Mod 1", status="failed")
    item2 = DownloadItem(mod_id="222", title="Mod 2", status="completed")
    item3 = DownloadItem(mod_id="333", title="Mod 3", status="failed")
    pool.items["111"] = item1
    pool.items["222"] = item2
    pool.items["333"] = item3

    retried_ids = await pool.retry_all_failed()
    assert sorted(retried_ids) == ["111", "333"]
    assert item1.status == "queued"
    assert item2.status == "completed"
    assert item3.status == "queued"
    assert pool.queue.qsize() == 2


@pytest.mark.asyncio
async def test_worker_pool_auto_retry_in_loop(monkeypatch, tmp_path):
    from unittest.mock import AsyncMock
    from src.core.config import config_manager

    pool = WorkerPool()
    pool.is_running = True
    worker_id = 0
    pool.workers[worker_id] = WorkerState(worker_id=worker_id, status="idle")

    # Configure auto-retry
    monkeypatch.setattr(config_manager.settings, "auto_retry", True)
    monkeypatch.setattr(config_manager.settings, "max_retries", 2)

    item = DownloadItem(mod_id="123", title="Retry Mod", status="queued")
    await pool.queue.put(item)
    pool.items["123"] = item

    attempts = 0

    async def mock_execute(w_id, w_dir, dl_item):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            dl_item.status = "failed"
            dl_item.error = f"Fail attempt {attempts}"
            return False
        dl_item.status = "completed"
        return True

    monkeypatch.setattr(pool, "_execute_download", mock_execute)
    monkeypatch.setattr(asyncio, "sleep", AsyncMock())

    # Run worker loop for 1 task
    task = asyncio.create_task(pool._worker_loop(worker_id))
    await asyncio.sleep(0.01)
    await pool.queue.join()
    pool.is_running = False
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    assert attempts == 3
    assert item.status == "completed"
    assert item.retry_count == 2

