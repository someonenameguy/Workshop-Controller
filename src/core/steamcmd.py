"""
SteamCMD manager: detection, automatic bootstrap from Valve CDN, and process execution.
"""

import asyncio
import os
import platform
import shutil
import signal
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path
from typing import AsyncGenerator, Callable, List, Optional, Tuple

import httpx

from src.core.config import APP_DIR, config_manager

STEAMCMD_DIR = APP_DIR / "steamcmd"

VALVE_URLS = {
    "Windows": "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip",
    "Linux": "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz",
    "Darwin": "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz",
}


def get_platform_exe_name() -> str:
    system = platform.system()
    if system == "Windows":
        return "steamcmd.exe"
    elif system == "Darwin":
        return "steamcmd.sh"
    return "steamcmd"


def find_steamcmd_executable() -> Optional[Path]:
    """Finds SteamCMD executable on system or in local app dir."""
    custom_path = config_manager.settings.steamcmd_custom_path
    if custom_path and custom_path.strip():
        p = Path(custom_path.strip()).expanduser().resolve()
        if p.is_file() and os.access(p, os.X_OK):
            return p

    exe_name = get_platform_exe_name()

    # Check local steamcmd directory
    local_candidates = [
        STEAMCMD_DIR / exe_name,
        STEAMCMD_DIR / "steamcmd.sh",
        STEAMCMD_DIR / "steamcmd",
    ]
    for candidate in local_candidates:
        if candidate.is_file() and (candidate.name.endswith(".exe") or os.access(candidate, os.X_OK)):
            return candidate

    # Check PATH
    which_path = shutil.which("steamcmd") or shutil.which("steamcmd.exe") or shutil.which("steamcmd.sh")
    if which_path:
        p = Path(which_path).resolve()
        if p.is_file():
            return p

    # Check common system paths
    system = platform.system()
    common_paths = []
    if system == "Linux":
        common_paths = [
            Path("/usr/bin/steamcmd"),
            Path("/usr/games/steamcmd"),
            Path("/usr/local/bin/steamcmd"),
            Path.home() / ".local/share/Steam/steamcmd/steamcmd.sh",
            Path.home() / ".steam/steam/steamcmd/steamcmd.sh",
        ]
    elif system == "Windows":
        common_paths = [
            Path("C:/steamcmd/steamcmd.exe"),
            Path("C:/Program Files (x86)/SteamCMD/steamcmd.exe"),
            Path("C:/Program Files/SteamCMD/steamcmd.exe"),
        ]
    elif system == "Darwin":
        common_paths = [
            Path.home() / "Library/Application Support/SteamCMD/steamcmd.sh",
            Path("/usr/local/bin/steamcmd"),
        ]

    for p in common_paths:
        if p.is_file() and (p.name.endswith(".exe") or os.access(p, os.X_OK)):
            return p

    return None


async def bootstrap_steamcmd(
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> Path:
    """
    Downloads and extracts official SteamCMD archive if not already installed.
    """
    system = platform.system()
    if system not in VALVE_URLS:
        raise RuntimeError(f"Unsupported operating system for SteamCMD: {system}")

    download_url = VALVE_URLS[system]
    STEAMCMD_DIR.mkdir(parents=True, exist_ok=True)

    archive_name = "steamcmd.zip" if system == "Windows" else "steamcmd.tar.gz"
    archive_path = STEAMCMD_DIR / archive_name

    if progress_callback:
        progress_callback("Connecting to Valve CDN...", 10)

    # Download archive
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        async with client.stream("GET", download_url) as response:
            if response.status_code != 200:
                raise RuntimeError(f"Failed to download SteamCMD: HTTP {response.status_code}")

            total_bytes = int(response.headers.get("content-length", 0))
            downloaded = 0

            with open(archive_path, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_bytes > 0 and progress_callback:
                        pct = int(10 + (downloaded / total_bytes) * 60)
                        progress_callback(
                            f"Downloading SteamCMD ({downloaded // 1024} KB / {total_bytes // 1024} KB)...",
                            pct,
                        )

    if progress_callback:
        progress_callback("Extracting SteamCMD archive...", 80)

    # Extract archive
    if archive_name.endswith(".zip"):
        with zipfile.ZipFile(archive_path, "r") as zip_ref:
            zip_ref.extractall(STEAMCMD_DIR)
    else:
        with tarfile.open(archive_path, "r:gz") as tar_ref:
            tar_ref.extractall(STEAMCMD_DIR)

    # Clean up archive
    try:
        archive_path.unlink()
    except Exception:
        pass

    # Ensure executable permission
    exe_path = find_steamcmd_executable()
    if not exe_path:
        # Fallback search inside directory
        for p in STEAMCMD_DIR.iterdir():
            if p.name in ("steamcmd", "steamcmd.exe", "steamcmd.sh"):
                exe_path = p
                break

    if exe_path and system != "Windows":
        os.chmod(exe_path, 0o755)

    if not exe_path:
        raise RuntimeError("SteamCMD extracted but executable could not be identified.")

    if progress_callback:
        progress_callback("SteamCMD successfully ready!", 100)

    return exe_path


class SteamCMDProcess:
    """Manages an active SteamCMD subprocess with line streaming and clean termination."""

    def __init__(self, cmd: List[str], cwd: Path):
        self.cmd = cmd
        self.cwd = cwd
        self.process: Optional[asyncio.subprocess.Process] = None
        self._killed = False

    async def start(self) -> None:
        kwargs = {
            "stdout": asyncio.subprocess.PIPE,
            "stderr": asyncio.subprocess.STDOUT,
            "cwd": str(self.cwd),
        }

        # Prevent console window popping up on Windows
        if platform.system() == "Windows":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        else:
            kwargs["preexec_fn"] = os.setsid  # New process group for clean kill

        self.process = await asyncio.create_subprocess_exec(*self.cmd, **kwargs)

    async def stream_output(self) -> AsyncGenerator[str, None]:
        if not self.process or not self.process.stdout:
            return

        while True:
            line = await self.process.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").rstrip("\r\n")
            yield text

    async def wait(self) -> int:
        if not self.process:
            return -1
        return await self.process.wait()

    async def terminate(self) -> None:
        """Forcefully kills the process and its entire process tree."""
        if not self.process or self._killed:
            return
        self._killed = True
        pid = self.process.pid
        if not pid:
            return

        system = platform.system()
        if system == "Windows":
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception:
                pass
        else:
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGKILL)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
