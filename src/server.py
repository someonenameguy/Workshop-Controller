"""
FastAPI application setup, static asset mounting, single-instance socket check,
and automated browser launching.
"""

from contextlib import asynccontextmanager
from pathlib import Path
import os
import socket
import sys
import threading
import time
import webbrowser
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from src.api.routes import router as api_router
from src.core.config import APP_DIR, config_manager
from src.core.worker_pool import worker_pool

# Path to static frontend files (bundled or in source tree)
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    STATIC_DIR = Path(sys._MEIPASS) / "src" / "static"
else:
    STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start worker pool
    await worker_pool.start()
    yield
    # Shutdown: Stop worker pool and terminate any SteamCMD children
    await worker_pool.stop()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Steam Workshop Downloader Controller",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(api_router)

    # Local thumbnail / preview image endpoint
    @app.get("/api/local-preview")
    async def get_local_preview(path: str):
        p = Path(path).resolve()
        if not p.is_file():
            raise HTTPException(status_code=404, detail="Image not found")
        # Ensure it's an image file
        if p.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            raise HTTPException(status_code=400, detail="Invalid image file format")
        return FileResponse(p)

    # Serve static frontend
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

    return app


def is_port_in_use(port: int) -> bool:
    """Checks if web port is already in use by another instance."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def open_browser_delayed(url: str, delay: float = 1.0):
    def _open():
        time.sleep(delay)
        try:
            webbrowser.open_new_tab(url)
        except Exception:
            pass

    threading.Thread(target=_open, daemon=True).start()


def run_server():
    """Main launcher function with single-instance detection."""
    port = config_manager.settings.web_port
    url = f"http://127.0.0.1:{port}"

    # Check if already running
    if is_port_in_use(port):
        print(f"[Launcher] Application is already running on {url}. Opening browser...")
        try:
            webbrowser.open_new_tab(url)
        except Exception:
            pass
        sys.exit(0)

    print("=" * 60)
    print("   STEAM WORKSHOP DOWNLOADER CONTROLLER")
    print(f"   Target Game: {config_manager.settings.game_name} (App ID: {config_manager.settings.app_id})")
    print(f"   Web Dashboard: {url}")
    print("   Press CTRL+C to quit.")
    print("=" * 60)

    if config_manager.settings.auto_open_browser:
        open_browser_delayed(url, delay=1.2)

    app = create_app()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=False,
    )
