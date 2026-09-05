#!/usr/bin/env python3
"""
PyInstaller packaging script for Steam Workshop Downloader Controller.
Produces a self-contained executable for Windows, Linux, or macOS.
"""

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"
STATIC_DIR = ROOT_DIR / "src" / "static"


def build():
    print("=" * 60)
    print("   BUILDING SELF-CONTAINED EXECUTABLE")
    print(f"   Platform: {platform.system()} ({platform.machine()})")
    print("=" * 60)

    # Clean prior builds
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR, ignore_errors=True)
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR, ignore_errors=True)

    data_separator = ";" if platform.system() == "Windows" else ":"
    data_arg = f"{STATIC_DIR}{data_separator}src/static"

    exe_name = "RimWorldWorkshopController"
    if platform.system() == "Windows":
        exe_name += ".exe"

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name",
        "RimWorldWorkshopController",
        "--onedir",  # portable directory distribution (fast startup)
        "--add-data",
        data_arg,
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.loops",
        "--hidden-import",
        "uvicorn.loops.auto",
        "--hidden-import",
        "uvicorn.protocols",
        "--hidden-import",
        "uvicorn.protocols.http",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.protocols.websockets",
        "--hidden-import",
        "uvicorn.protocols.websockets.auto",
        "--hidden-import",
        "uvicorn.lifespan",
        "--hidden-import",
        "uvicorn.lifespan.on",
        "--hidden-import",
        "anyio._backends._asyncio",
        "--clean",
        "--noconfirm",
        str(ROOT_DIR / "main.py"),
    ]

    print("Running PyInstaller with command:")
    print(" ".join(cmd))
    res = subprocess.run(cmd, cwd=str(ROOT_DIR))
    if res.returncode != 0:
        print("\n[ERROR] Build failed!")
        sys.exit(res.returncode)

    print("\n[SUCCESS] Build complete!")
    print(f"Output available at: {DIST_DIR / 'RimWorldWorkshopController'}")


if __name__ == "__main__":
    build()
