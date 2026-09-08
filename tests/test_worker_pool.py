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


def test_clear_worker_dir_nested_files_and_folders(tmp_path):
    import os
    from src.core.worker_pool import _clear_worker_dir

    worker_dir = tmp_path / "worker_0"
    worker_dir.mkdir(parents=True, exist_ok=True)

    # Populate with various files, nested folders, symlinks, read-only files
    file1 = worker_dir / "test_file.txt"
    file1.write_text("hello")

    nested_dir = worker_dir / "steamapps" / "workshop" / "content" / "294100" / "12345"
    nested_dir.mkdir(parents=True, exist_ok=True)
    nested_file = nested_dir / "About.xml"
    nested_file.write_text("<ModMetaData/>")

    # Read-only file
    readonly_file = nested_dir / "readonly.txt"
    readonly_file.write_text("readonly content")
    os.chmod(readonly_file, 0o444)

    # Symlink if supported
    symlink_file = worker_dir / "symlink_file"
    try:
        symlink_file.symlink_to(file1)
    except OSError:
        pass

    assert any(worker_dir.iterdir())

    # Call _clear_worker_dir
    _clear_worker_dir(worker_dir)

    # Assert worker_dir exists, is a directory, and is completely empty
    assert worker_dir.exists()
    assert worker_dir.is_dir()
    assert list(worker_dir.iterdir()) == []


def test_clear_worker_dir_nonexistent_and_file(tmp_path):
    from src.core.worker_pool import _clear_worker_dir

    # Nonexistent directory
    worker_dir = tmp_path / "nonexistent_worker"
    assert not worker_dir.exists()
    _clear_worker_dir(worker_dir)
    assert worker_dir.exists()
    assert worker_dir.is_dir()
    assert list(worker_dir.iterdir()) == []

    # Target path is currently a file
    file_dir = tmp_path / "file_worker"
    file_dir.write_text("i am a file")
    assert file_dir.is_file()
    _clear_worker_dir(file_dir)
    assert file_dir.exists()
    assert file_dir.is_dir()
    assert list(file_dir.iterdir()) == []


@pytest.mark.asyncio
async def test_execute_download_clears_worker_folder_prior_to_download(tmp_path, monkeypatch):
    from pathlib import Path
    from unittest.mock import AsyncMock
    from src.core.mod_manager import mod_manager
    from src.core.worker_pool import DownloadItem, WorkerPool

    pool = WorkerPool()
    worker_id = 0
    worker_dir = tmp_path / "worker_0"
    worker_dir.mkdir(parents=True, exist_ok=True)

    # Add leftover files from a previous run
    stale_file = worker_dir / "leftover_old_file.txt"
    stale_file.write_text("stale data")
    stale_dir = worker_dir / "steamapps" / "old_workshop"
    stale_dir.mkdir(parents=True, exist_ok=True)
    stale_subfile = stale_dir / "old_acf.acf"
    stale_subfile.write_text("acf content")

    item = DownloadItem(mod_id="112233", title="Test Mod", app_id=294100)

    # Mock steamcmd executable
    dummy_exe = tmp_path / "steamcmd.sh"
    dummy_exe.touch()
    monkeypatch.setattr("src.core.worker_pool.find_steamcmd_executable", lambda: dummy_exe)

    was_cleared_before_steamcmd = False

    class MockSteamCMDProcess:
        def __init__(self, cmd, cwd):
            nonlocal was_cleared_before_steamcmd
            # Stale files must NOT exist when SteamCMDProcess is initialized
            if not stale_file.exists() and not stale_dir.exists() and not stale_subfile.exists():
                was_cleared_before_steamcmd = True
            self.cmd = cmd
            self.cwd = cwd

        async def start(self):
            # Simulate steamcmd creating staging files
            staging_path = (
                worker_dir
                / "steamapps"
                / "workshop"
                / "content"
                / "294100"
                / "112233"
            )
            staging_path.mkdir(parents=True, exist_ok=True)
            (staging_path / "mod_file.txt").write_text("mod payload")

        async def stream_output(self):
            yield "Success. downloaded item 112233"

        async def wait(self):
            return 0

    monkeypatch.setattr("src.core.worker_pool.SteamCMDProcess", MockSteamCMDProcess)
    monkeypatch.setattr(mod_manager, "install_downloaded_mod", AsyncMock(return_value=Path("/dest/Test Mod")))

    success = await pool._execute_download(worker_id, worker_dir, item)

    assert was_cleared_before_steamcmd is True
    assert success is True
    assert item.status == "completed"
    # Verify that leftover staging files or scripts are cleaned up after completion
    assert list(worker_dir.iterdir()) == []


@pytest.mark.asyncio
async def test_execute_download_cleans_up_on_failure(tmp_path, monkeypatch):
    from src.core.worker_pool import DownloadItem, WorkerPool

    pool = WorkerPool()
    worker_id = 1
    worker_dir = tmp_path / "worker_1"
    worker_dir.mkdir(parents=True, exist_ok=True)

    item = DownloadItem(mod_id="445566", title="Failing Mod", app_id=294100)

    dummy_exe = tmp_path / "steamcmd.sh"
    dummy_exe.touch()
    monkeypatch.setattr("src.core.worker_pool.find_steamcmd_executable", lambda: dummy_exe)

    class MockFailingProcess:
        def __init__(self, cmd, cwd):
            self.cmd = cmd
            self.cwd = cwd

        async def start(self):
            # Create some intermediate garbage files
            garbage_dir = worker_dir / "steamapps" / "downloading"
            garbage_dir.mkdir(parents=True, exist_ok=True)
            (garbage_dir / "temp.bin").write_text("corrupted")

        async def stream_output(self):
            yield "ERROR! Download item 445566 failed (Disk error)."

        async def wait(self):
            return 1

    monkeypatch.setattr("src.core.worker_pool.SteamCMDProcess", MockFailingProcess)

    success = await pool._execute_download(worker_id, worker_dir, item)

    assert success is False
    assert item.status == "failed"
    assert "Disk error" in item.error
    # Verify worker_dir is cleaned up after failure
    assert list(worker_dir.iterdir()) == []


@pytest.mark.asyncio
async def test_worker_loop_clears_worker_dir_at_startup(tmp_path, monkeypatch):
    import src.core.worker_pool as wp_module
    from src.core.worker_pool import WorkerPool, WorkerState

    monkeypatch.setattr(wp_module, "TEMP_WORKERS_DIR", tmp_path)
    worker_dir = tmp_path / "worker_5"
    worker_dir.mkdir(parents=True, exist_ok=True)
    stale_file = worker_dir / "leftover_old.txt"
    stale_file.write_text("old")

    pool = WorkerPool()
    pool.workers[5] = WorkerState(worker_id=5, status="idle")

    # Stop before taking items from queue
    pool.is_running = False
    await pool._worker_loop(5)

    assert not stale_file.exists()
    assert worker_dir.exists()
    assert list(worker_dir.iterdir()) == []

