"""
Parallel SteamCMD worker pool with isolated runtime environments.
Prevents appworkshop.acf lock contention and enables true parallel downloads.
"""

import asyncio
import os
import shutil
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from pydantic import BaseModel

from src.core.config import TEMP_WORKERS_DIR, config_manager
from src.core.mod_manager import mod_manager
from src.core.mod_scanner import parse_about_xml
from src.core.steam_api import steam_api_client
from src.core.steamcmd import (
    SteamCMDProcess,
    bootstrap_steamcmd,
    find_steamcmd_executable,
)


class DownloadItem(BaseModel):
    mod_id: str
    title: str = ""
    app_id: int = 294100
    status: str = "queued"  # queued, downloading, installing, completed, failed, cancelled
    worker_id: Optional[int] = None
    progress: int = 0
    message: str = "In queue"
    error: Optional[str] = None
    added_at: float = 0.0


class WorkerState(BaseModel):
    worker_id: int
    status: str = "idle"  # idle, downloading, installing, error
    current_mod_id: Optional[str] = None
    current_mod_title: Optional[str] = None


class WorkerPool:
    """Manages parallel SteamCMD worker processes."""

    def __init__(self):
        self.queue: asyncio.Queue[DownloadItem] = asyncio.Queue()
        self.items: Dict[str, DownloadItem] = {}
        self.workers: Dict[int, WorkerState] = {}
        self.active_processes: Dict[int, SteamCMDProcess] = {}
        self.worker_tasks: List[asyncio.Task] = []
        self.is_running = False
        self.subscribers: Set[Callable[[Dict[str, Any]], Any]] = set()
        self.logs: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()

    def subscribe(self, callback: Callable[[Dict[str, Any]], Any]) -> None:
        """Register a callback for live event broadcasting (WebSocket)."""
        self.subscribers.add(callback)

    def unsubscribe(self, callback: Callable[[Dict[str, Any]], Any]) -> None:
        self.subscribers.discard(callback)

    async def broadcast(self, event_type: str, data: Any) -> None:
        """Broadcasts event to all active WebSocket clients."""
        payload = {"type": event_type, "data": data, "timestamp": time.time()}
        for sub in list(self.subscribers):
            try:
                res = sub(payload)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:
                pass

    async def log(self, worker_id: Optional[int], message: str, level: str = "info") -> None:
        """Appends log entry and broadcasts to UI console."""
        prefix = f"[Worker {worker_id}] " if worker_id is not None else "[System] "
        full_msg = f"{prefix}{message}"
        entry = {
            "worker_id": worker_id,
            "message": full_msg,
            "level": level,
            "time": time.strftime("%H:%M:%S"),
        }
        self.logs.append(entry)
        if len(self.logs) > 500:
            self.logs.pop(0)
        await self.broadcast("log", entry)
        print(full_msg)

    async def start(self) -> None:
        """Starts worker pool loop matching max_parallel_workers."""
        if self.is_running:
            return
        self.is_running = True
        num_workers = config_manager.settings.max_parallel_workers
        await self.log(None, f"Starting SteamCMD worker pool with {num_workers} parallel workers.")

        for w_id in range(num_workers):
            self.workers[w_id] = WorkerState(worker_id=w_id, status="idle")
            t = asyncio.create_task(self._worker_loop(w_id))
            self.worker_tasks.append(t)

        await self.broadcast("workers_updated", self.get_workers_status())

    async def stop(self) -> None:
        """Stops worker pool and cancels running subprocesses."""
        self.is_running = False
        # Cancel all active SteamCMD processes
        for p in list(self.active_processes.values()):
            await p.terminate()
        self.active_processes.clear()

        for t in self.worker_tasks:
            t.cancel()
        self.worker_tasks.clear()
        self.workers.clear()
        await self.log(None, "Worker pool stopped.")
        await self.broadcast("workers_updated", [])

    def get_queue_status(self) -> List[Dict[str, Any]]:
        return [item.model_dump() for item in self.items.values()]

    def get_workers_status(self) -> List[Dict[str, Any]]:
        return [w.model_dump() for w in self.workers.values()]

    async def add_downloads(self, mod_ids: List[str], app_id: Optional[int] = None) -> List[str]:
        """Adds mod IDs to download queue."""
        target_app_id = app_id or config_manager.settings.app_id
        added_ids: List[str] = []

        # Query titles via Steam Web API for immediate friendly display
        details_map = await steam_api_client.get_published_file_details(mod_ids)

        async with self._lock:
            for m_id in mod_ids:
                if m_id in self.items and self.items[m_id].status in ("queued", "downloading"):
                    continue  # already in progress

                title = f"Mod {m_id}"
                if m_id in details_map and details_map[m_id].title:
                    title = details_map[m_id].title

                item = DownloadItem(
                    mod_id=m_id,
                    title=title,
                    app_id=target_app_id,
                    status="queued",
                    message="Waiting in queue",
                    added_at=time.time(),
                )
                self.items[m_id] = item
                await self.queue.put(item)
                added_ids.append(m_id)

        await self.broadcast("queue_updated", self.get_queue_status())
        await self.log(None, f"Enqueued {len(added_ids)} mod(s) for download.")
        return added_ids

    async def cancel_download(self, mod_id: str) -> bool:
        """Cancels a specific queued or active download."""
        if mod_id not in self.items:
            return False

        item = self.items[mod_id]
        if item.status == "downloading" and item.worker_id is not None:
            proc = self.active_processes.get(item.worker_id)
            if proc:
                await proc.terminate()
        item.status = "cancelled"
        item.message = "Cancelled by user"
        await self.broadcast("queue_updated", self.get_queue_status())
        return True

    async def cancel_all(self) -> None:
        """Cancels all active and queued downloads."""
        for item in self.items.values():
            if item.status in ("queued", "downloading"):
                item.status = "cancelled"
                item.message = "Cancelled"
        for proc in list(self.active_processes.values()):
            await proc.terminate()
        # Empty queue
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except Exception:
                break
        await self.broadcast("queue_updated", self.get_queue_status())

    async def _worker_loop(self, worker_id: int) -> None:
        """Dedicated loop for worker instance worker_id."""
        worker_dir = TEMP_WORKERS_DIR / f"worker_{worker_id}"
        worker_dir.mkdir(parents=True, exist_ok=True)

        while self.is_running:
            try:
                item = await self.queue.get()
            except asyncio.CancelledError:
                break

            if item.status == "cancelled":
                self.queue.task_done()
                continue

            # Update worker & item state
            self.workers[worker_id].status = "downloading"
            self.workers[worker_id].current_mod_id = item.mod_id
            self.workers[worker_id].current_mod_title = item.title

            item.status = "downloading"
            item.worker_id = worker_id
            item.progress = 10
            item.message = f"Downloading on Worker {worker_id}..."

            await self.broadcast("workers_updated", self.get_workers_status())
            await self.broadcast("queue_updated", self.get_queue_status())

            # Perform download with retry
            success = await self._execute_download(worker_id, worker_dir, item)

            self.workers[worker_id].status = "idle"
            self.workers[worker_id].current_mod_id = None
            self.workers[worker_id].current_mod_title = None

            await self.broadcast("workers_updated", self.get_workers_status())
            await self.broadcast("queue_updated", self.get_queue_status())
            self.queue.task_done()

    async def _execute_download(
        self, worker_id: int, worker_dir: Path, item: DownloadItem
    ) -> bool:
        """Executes a single SteamCMD download inside isolated worker_dir."""
        exe_path = find_steamcmd_executable()
        if not exe_path:
            await self.log(worker_id, "SteamCMD not found. Attempting automatic setup...", "warn")
            try:
                exe_path = await bootstrap_steamcmd()
            except Exception as e:
                item.status = "failed"
                item.error = f"SteamCMD setup failed: {e}"
                item.message = "Failed: SteamCMD setup error"
                await self.log(worker_id, f"SteamCMD setup failed: {e}", "error")
                return False

        # Build runscript
        script_file = worker_dir / f"run_download_{item.mod_id}.txt"
        settings = config_manager.settings

        login_cmd = f"login {settings.steam_user}"
        if settings.steam_user != "anonymous" and settings.steam_pass:
            login_cmd += f" {settings.steam_pass}"

        script_content = (
            f'@ShutdownOnFailedCommand 0\n'
            f'@NoPromptForPassword 1\n'
            f'force_install_dir "{worker_dir.resolve()}"\n'
            f'{login_cmd}\n'
            f'workshop_download_item {item.app_id} {item.mod_id} validate\n'
            f'quit\n'
        )
        script_file.write_text(script_content, encoding="utf-8")

        cmd = [str(exe_path), "+runscript", str(script_file.resolve())]
        proc = SteamCMDProcess(cmd=cmd, cwd=worker_dir)
        self.active_processes[worker_id] = proc

        await self.log(worker_id, f"Starting download for {item.title} (ID {item.mod_id}).")

        download_failed = False
        error_reason = ""
        success_detected = False

        try:
            await proc.start()
            async for line in proc.stream_output():
                await self.log(worker_id, line)

                line_lower = line.lower()
                if "error! download item" in line_lower:
                    download_failed = True
                    error_reason = line.strip()
                elif "success. downloaded item" in line_lower:
                    success_detected = True
                    item.progress = 80
                    item.message = "Verifying & Installing..."
                    await self.broadcast("queue_updated", self.get_queue_status())

            exit_code = await proc.wait()
        except asyncio.CancelledError:
            await proc.terminate()
            item.status = "cancelled"
            item.message = "Cancelled"
            return False
        except Exception as e:
            download_failed = True
            error_reason = str(e)
        finally:
            self.active_processes.pop(worker_id, None)
            try:
                script_file.unlink(missing_ok=True)
            except Exception:
                pass

        # Check output staging path
        # SteamCMD saves to: <worker_dir>/steamapps/workshop/content/<app_id>/<mod_id>
        staging_mod_path = (
            worker_dir
            / "steamapps"
            / "workshop"
            / "content"
            / str(item.app_id)
            / str(item.mod_id)
        )

        if not download_failed and staging_mod_path.is_dir() and any(staging_mod_path.iterdir()):
            # Check staging_mod_path / "About" / "About.xml" for real mod title
            about_xml = staging_mod_path / "About" / "About.xml"
            if about_xml.is_file():
                meta = parse_about_xml(about_xml)
                if meta.get("name") and meta["name"].strip():
                    item.title = meta["name"].strip()
                    if worker_id in self.workers:
                        self.workers[worker_id].current_mod_title = item.title
                    await self.broadcast("workers_updated", self.get_workers_status())

            item.status = "installing"
            item.progress = 90
            item.message = "Moving mod to destination folder..."
            await self.broadcast("queue_updated", self.get_queue_status())

            try:
                final_path = await mod_manager.install_downloaded_mod(
                    staging_mod_path=staging_mod_path,
                    mod_id=item.mod_id,
                    app_id=item.app_id,
                )
                item.status = "completed"
                item.progress = 100
                item.message = f"Installed successfully to {final_path.name}"
                await self.log(worker_id, f"Successfully downloaded and installed {item.title}!")
                # Clean up staging content for this item
                shutil.rmtree(staging_mod_path, ignore_errors=True)
                return True
            except Exception as e:
                item.status = "failed"
                item.error = f"Installation error: {e}"
                item.message = "Failed during installation"
                await self.log(worker_id, f"Failed installing {item.mod_id}: {e}", "error")
                return False
        else:
            item.status = "failed"
            item.error = error_reason or "SteamCMD download failed or item empty."
            item.message = f"Download failed ({error_reason or 'Failure'})"
            await self.log(worker_id, f"Download failed for {item.mod_id}: {item.error}", "error")
            return False


worker_pool = WorkerPool()
