import asyncio
import pytest
from src.core.worker_pool import DownloadItem, WorkerPool


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
