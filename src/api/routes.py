"""
FastAPI REST routes and WebSocket endpoint for the web dashboard.
"""

import os
import signal
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from src.core.config import config_manager, ModFolderProfile
from src.core.mod_manager import mod_manager
from src.core.mod_refactor import mod_refactorer
from src.core.mod_scanner import mod_scanner
from src.core.steam_api import steam_api_client
from src.core.steamcmd import (
    bootstrap_steamcmd,
    find_steamcmd_executable,
)
from src.core.worker_pool import worker_pool

router = APIRouter(prefix="/api")


# Request models
class SettingsUpdateRequest(BaseModel):
    download_path: Optional[str] = None
    max_parallel_workers: Optional[int] = None
    app_id: Optional[int] = None
    game_name: Optional[str] = None
    steam_user: Optional[str] = None
    steam_pass: Optional[str] = None
    auto_backup: Optional[bool] = None
    web_port: Optional[int] = None
    auto_open_browser: Optional[bool] = None
    steamcmd_custom_path: Optional[str] = None
    active_profile_id: Optional[str] = None
    profiles: Optional[List[ModFolderProfile]] = None


class SwitchProfileRequest(BaseModel):
    profile_id: str


class AddOrUpdateProfileRequest(BaseModel):
    profile: ModFolderProfile


class DeleteProfileRequest(BaseModel):
    profile_id: str


class DownloadRequest(BaseModel):
    input_text: str
    app_id: Optional[int] = None


class CancelRequest(BaseModel):
    mod_id: Optional[str] = None
    cancel_all: bool = False


class DeleteModRequest(BaseModel):
    folder_path: str


class OpenFolderRequest(BaseModel):
    folder_path: Optional[str] = None


class RefactorScanRequest(BaseModel):
    target_path: Optional[str] = None


class RefactorExecuteItem(BaseModel):
    folder_path: str
    mod_id: Optional[str] = None
    rename_folder: bool = True
    force_title: Optional[str] = None


class RefactorExecuteRequest(BaseModel):
    items: List[RefactorExecuteItem]


# ---------------- Settings ----------------
@router.get("/settings")
async def get_settings():
    settings = config_manager.settings.model_dump()
    resolved_path = str(config_manager.settings.get_resolved_download_path())
    steamcmd_exe = find_steamcmd_executable()
    return {
        "settings": settings,
        "resolved_download_path": resolved_path,
        "steamcmd_found": steamcmd_exe is not None,
        "steamcmd_path": str(steamcmd_exe) if steamcmd_exe else None,
    }


@router.post("/settings")
async def update_settings(req: SettingsUpdateRequest):
    old_workers = config_manager.settings.max_parallel_workers
    updated = config_manager.update(req.model_dump(exclude_unset=True))

    # If worker count changed, restart pool
    if updated.max_parallel_workers != old_workers and worker_pool.is_running:
        await worker_pool.stop()
        await worker_pool.start()

    return {
        "status": "success",
        "settings": updated.model_dump(),
        "resolved_download_path": str(updated.get_resolved_download_path()),
    }


# ---------------- Profiles ----------------
@router.get("/profiles")
async def list_profiles():
    return {
        "active_profile_id": config_manager.settings.active_profile_id,
        "active_profile": config_manager.get_active_profile().model_dump(),
        "profiles": [p.model_dump() for p in config_manager.settings.profiles],
    }


@router.post("/profiles/switch")
async def switch_profile(req: SwitchProfileRequest):
    prof = config_manager.switch_profile(req.profile_id)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Profile '{req.profile_id}' not found.")
    return {
        "status": "success",
        "active_profile": prof.model_dump(),
        "resolved_download_path": str(config_manager.get_resolved_download_path()),
    }


@router.post("/profiles/add-or-update")
async def add_or_update_profile(req: AddOrUpdateProfileRequest):
    config_manager.add_or_update_profile(req.profile)
    return {
        "status": "success",
        "profile": req.profile.model_dump(),
        "profiles": [p.model_dump() for p in config_manager.settings.profiles],
    }


@router.post("/profiles/delete")
async def delete_profile(req: DeleteProfileRequest):
    success = config_manager.delete_profile(req.profile_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete profile: either it does not exist or it is the only remaining profile.",
        )
    return {
        "status": "success",
        "active_profile_id": config_manager.settings.active_profile_id,
        "profiles": [p.model_dump() for p in config_manager.settings.profiles],
    }


# ---------------- Mods & Updates ----------------
@router.get("/mods")
async def list_mods(check_updates: bool = False):
    mods = await mod_scanner.scan_installed_mods(check_online=check_updates)
    return {
        "count": len(mods),
        "mods": [m.model_dump() for m in mods],
        "download_path": str(config_manager.settings.get_resolved_download_path()),
    }


@router.post("/mods/check-updates")
async def check_updates():
    mods = await mod_scanner.scan_installed_mods(check_online=True)
    outdated = [m for m in mods if m.update_available]
    return {
        "count": len(mods),
        "outdated_count": len(outdated),
        "mods": [m.model_dump() for m in mods],
    }


@router.post("/mods/update-outdated")
async def update_outdated():
    mods = await mod_scanner.scan_installed_mods(check_online=True)
    outdated_ids = [m.mod_id for m in mods if m.update_available and not m.is_non_steam]
    if not outdated_ids:
        return {"status": "success", "enqueued": 0, "message": "All mods are up to date."}

    enqueued = await worker_pool.add_downloads(outdated_ids)
    return {
        "status": "success",
        "enqueued": len(enqueued),
        "mod_ids": enqueued,
        "message": f"Enqueued {len(enqueued)} outdated mod(s) for update.",
    }


# ---------------- Download Queue ----------------
@router.post("/mods/download")
async def enqueue_downloads(req: DownloadRequest):
    if not req.input_text or not req.input_text.strip():
        raise HTTPException(status_code=400, detail="No URLs or Mod IDs provided.")

    mod_ids, collections = await steam_api_client.parse_input_text(req.input_text)
    if not mod_ids:
        raise HTTPException(
            status_code=400,
            detail="No valid Steam Workshop IDs or Collections detected in input.",
        )

    enqueued = await worker_pool.add_downloads(mod_ids, app_id=req.app_id)
    return {
        "status": "success",
        "detected_collections": collections,
        "enqueued_count": len(enqueued),
        "mod_ids": enqueued,
    }


@router.get("/queue")
async def get_queue():
    return {
        "items": worker_pool.get_queue_status(),
        "workers": worker_pool.get_workers_status(),
    }


@router.post("/mods/cancel")
async def cancel_downloads(req: CancelRequest):
    if req.cancel_all:
        await worker_pool.cancel_all()
        return {"status": "success", "message": "All downloads cancelled."}
    elif req.mod_id:
        success = await worker_pool.cancel_download(req.mod_id)
        return {"status": "success" if success else "not_found", "mod_id": req.mod_id}
    else:
        raise HTTPException(status_code=400, detail="Specify mod_id or cancel_all=True.")


@router.post("/mods/delete")
async def delete_mod(req: DeleteModRequest):
    p = Path(req.folder_path)
    if not p.is_dir():
        raise HTTPException(status_code=404, detail=f"Folder not found: {p}")
    mod_manager.delete_mod(p)
    return {"status": "success", "deleted": str(p)}


@router.post("/mods/open-folder")
async def open_folder(req: OpenFolderRequest):
    if req.folder_path and req.folder_path.strip():
        p = Path(req.folder_path.strip())
    else:
        p = config_manager.settings.get_resolved_download_path()

    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)

    mod_manager.open_in_file_manager(p)
    return {"status": "success", "opened": str(p)}


# ---------------- Refactor / Healer ----------------
@router.post("/refactor/scan")
async def scan_for_refactor(req: RefactorScanRequest):
    if req.target_path and req.target_path.strip():
        target = Path(req.target_path.strip()).expanduser().resolve()
    else:
        target = config_manager.settings.get_resolved_download_path()

    if not target.is_dir():
        raise HTTPException(status_code=404, detail=f"Directory {target} not found.")

    candidates = await mod_refactorer.scan_folder_for_refactor(target)
    return {
        "target_path": str(target),
        "count": len(candidates),
        "candidates": [c.model_dump() for c in candidates],
    }


@router.post("/refactor/execute")
async def execute_refactor(req: RefactorExecuteRequest):
    results = []
    for item in req.items:
        try:
            res = await mod_refactorer.execute_refactor(
                folder_path=item.folder_path,
                mod_id=item.mod_id,
                rename_folder=item.rename_folder,
                force_title=item.force_title,
            )
            results.append(res)
        except Exception as e:
            results.append({
                "status": "error",
                "folder_path": item.folder_path,
                "mod_id": item.mod_id,
                "error": str(e),
            })

    success_count = sum(1 for r in results if r.get("status") == "success")
    error_count = sum(1 for r in results if r.get("status") == "error")

    return {
        "status": "completed",
        "total": len(req.items),
        "success_count": success_count,
        "error_count": error_count,
        "results": results,
    }


# ---------------- System & Diagnostics ----------------
@router.get("/system/status")
async def system_status():
    steamcmd_exe = find_steamcmd_executable()
    return {
        "steamcmd_ready": steamcmd_exe is not None,
        "steamcmd_path": str(steamcmd_exe) if steamcmd_exe else None,
        "workers_count": config_manager.settings.max_parallel_workers,
        "download_path": str(config_manager.settings.get_resolved_download_path()),
        "game_name": config_manager.settings.game_name,
        "app_id": config_manager.settings.app_id,
        "active_queue_count": sum(
            1 for i in worker_pool.items.values() if i.status in ("queued", "downloading")
        ),
    }


@router.post("/system/bootstrap-steamcmd")
async def trigger_bootstrap():
    try:
        path = await bootstrap_steamcmd()
        return {"status": "success", "path": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system/logs")
async def get_logs():
    return {"logs": worker_pool.logs}


@router.post("/system/shutdown")
async def shutdown_system():
    """Cleanly stops workers, broadcasts shutdown event, and terminates the server process."""
    await worker_pool.log(None, "Shutdown requested from Web UI. Stopping workers...", "warn")
    await worker_pool.stop()
    await worker_pool.broadcast("shutdown", {"message": "Controller application is shutting down."})

    def _delayed_exit():
        time.sleep(0.5)
        try:
            # Send SIGINT to own process so uvicorn / main thread shuts down gracefully
            os.kill(os.getpid(), signal.SIGINT)
        except Exception:
            os._exit(0)

    threading.Thread(target=_delayed_exit, daemon=True).start()
    return {"status": "shutting_down", "message": "Workshop Controller is shutting down."}


# ---------------- WebSocket ----------------
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    async def send_event(data: Dict[str, Any]):
        try:
            await websocket.send_json(data)
        except Exception:
            pass

    worker_pool.subscribe(send_event)

    # Send initial state snapshot
    await websocket.send_json({"type": "init", "data": {
        "queue": worker_pool.get_queue_status(),
        "workers": worker_pool.get_workers_status(),
        "logs": worker_pool.logs[-50:],
    }})

    try:
        while True:
            # Keepalive / receive ping
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        worker_pool.unsubscribe(send_event)
