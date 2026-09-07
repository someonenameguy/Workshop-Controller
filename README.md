# Steam Workshop Downloader Controller

<p align="center">
  <strong>A modern, cross-platform Steam Workshop Downloader, Mod Manager, and Folder Healer.</strong><br>
  Parallel SteamCMD downloads, an interactive dark-themed localhost Web UI, automated update scanning, multi-game profiles, and zero-dependency packaging for non-technical gamers.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-4CAF50" alt="Platform">
  <img src="https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Tests-33%20Passing-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/License-MIT-purple" alt="License">
</p>

---

## Table of Contents

- [Key Features](#-key-features)
- [Quick Start](#-quick-start)
  - [Windows](#windows)
  - [Linux / macOS](#linux--macos)
- [Web Dashboard Overview](#-web-dashboard-overview)
- [Steam-Style Tag Filtering & Search](#️-steam-style-tag-filtering--search)
- [Multi-Game & Multi-Folder Profiles](#-multi-game--multi-folder-profiles)
- [Mod Folder Healer & Refactorer](#-mod-folder-healer--refactorer)
- [Building Standalone Executables](#-building-standalone-executables-zero-dependency-shipping)
- [Project Structure](#-project-structure)
- [Testing](#-running-tests)
- [Documentation & API Reference](#-documentation--api-reference)
- [License](#-license)

---

## 🚀 Key Features

- **Localhost Web Dashboard**: Beautiful, responsive dark gamer UI accessible from any modern web browser.
- **Automated Browser Launch**: Launches the local server and automatically opens your browser upon starting.
- **Zero-Dependency Bootstrapping**:
  - Automatically detects or downloads the official SteamCMD archive from Valve's CDN on first launch.
  - Zero Node.js or NPM build steps required — all frontend assets are self-contained.
- **Collision-Free Parallel Downloads**:
  - Download multiple workshop items simultaneously with user-configurable concurrency (1 to 8 workers, default: 3).
  - Each worker runs in an **isolated staging environment** to completely avoid `appworkshop_<appid>.acf` file-lock conflicts and cache race conditions.
- **Multi-Game & Multi-Folder Profiles**:
  - Manage multiple mod folders across different games (*RimWorld*, *Stellaris*, *Cities: Skylines*, *Project Zomboid*, *Garry's Mod*, *Don't Starve Together*, etc.).
  - Instant quick-switch dropdown in the top navigation bar updates target paths and App IDs on the fly.
- **Persistent High-Res Thumbnails & Metadata**:
  - Locally caches Steam Workshop metadata (titles, preview URLs, tags, timestamps) in `data/workshop_cache.json`.
  - Preview images and tags load instantly on initial startup and remain intact after mod deletions.
  - Expanded local discovery finds `ModIcon.png`, `Preview.png`, `Preview.jpeg`, and `Preview.webp`.
- **Dynamic Steam-Style Tag Filtering & Search Sidebar**:
  - Full-featured filter sidebar modeled after the official Steam Workshop interface.
  - Dynamically organizes tags by **Categories** (types and game versions like `1.6`/`1.5`), **Required DLC**, and **Other Tags**.
  - **Include (+) & Exclude (−) Tag Filtering**: Click `+` to require a tag or `−` to filter it out; interactive active filter chips with 1-click removal.
  - Game-aware search input placeholder matching the currently active game profile.
  - Interactive tag pills directly on mod cards for rapid 1-click filtering.
- **Folder Refactor & Healer**:
  - Scans loose or third-party mods (e.g., direct zip extractions or mods named with numeric IDs).
  - Automatically discovers Workshop IDs from `About.xml`, descriptions, or URLs.
  - Resolves unlisted / mature mods (Steam API `result=9`) directly from local `About.xml` metadata.
  - Safely renames folders to friendly mod names and generates official `PublishedFileId.txt` and `.lastupdated` files.
- **Resilient Downloads with Automatic Retries**:
  - Automatic download retries with user-configurable max retry attempts (1–10) to mitigate transient Valve CDN drops.
  - Dedicated 1-click **🔄 Retry Failed** action in the Download Queue as well as per-item manual retry controls.
- **Smart Update Scanner**:
  - Scans installed mods and compares local timestamps against live Steam Workshop update timestamps.
  - Visual "Update Available" indicators and 1-click **Update All Outdated Mods**.
  - Creates automatic compressed zip backups in `backups/` before overwriting existing mods.
- **Safe Application Stop**:
  - Dedicated "🛑 Stop" button in the navigation bar and Settings tab.
  - Gracefully terminates active worker subprocesses and exits the Python server without leaving orphan tasks.
- **Real-Time Live Console**:
  - Streams SteamCMD terminal logs and worker status indicators in real time via WebSockets.

---

## ⚡ Quick Start

### Windows
Double-click the portable launcher:
```cmd
run.bat
```

### Linux / macOS
Make the launcher executable and run:
```bash
chmod +x run.sh
./run.sh
```

The application will verify or auto-download SteamCMD, launch the background server, and open your browser to `http://127.0.0.1:8080`.

---

## 🖥️ Web Dashboard Overview

| Tab | Description |
|---|---|
| **📦 Installed Mods** | Steam Workshop-style layout with search, special filters (`Updates Available`, `Steam`, `Non-Steam`), category/DLC tag sidebar with Include (`+`) / Exclude (`-`) toggles, active filter chips, mod size indicators, and 1-click update/delete actions. |
| **📥 Download Queue** | Paste single/multiple Workshop URLs, numeric IDs, or Steam Collections. Monitor parallel worker cards, real-time download status, automatic retries, and 1-click **Retry Failed**. |
| **🩺 Folder Refactor / Healer** | Scan loose mod directories, preview proposed title renames, and repair `PublishedFileId.txt` metadata with a live step-by-step progress bar. |
| **⚙️ Settings** | Configure game profiles, custom mod paths, worker counts (1–8), automatic retry attempts (1–10), automatic backups, Steam credentials, and custom SteamCMD paths. |
| **📜 Console Logs** | Inspect real-time console logs streamed directly from SteamCMD worker subprocesses with auto-scroll and clear controls. |

---

## 🏷️ Steam-Style Tag Filtering & Search

The **Installed Mods** view provides a Steam Workshop-accurate filtering sidebar:
- **Search Bar**: Profile-aware search that filters mod titles, authors, package IDs, and descriptions in real time.
- **Include (`+`) & Exclude (`-`) Filtering**:
  - Click `+` on any tag row to require that tag on matching mods.
  - Click `−` to exclude mods possessing that tag.
  - Selected tags appear as colored active filter chips above the grid (`+ Version 1.5`, `− Translation`) with 1-click removal.
- **Grouped Categories**:
  - **Categories**: Mod types (`Mod`, `Translation`, `Scenario`) and sorted game version tags (`1.4`, `1.5`, `1.6`).
  - **Required DLC**: Game-specific expansions (*Anomaly*, *Biotech*, *Ideology*, *Royalty*, etc.).
  - **Other Tags**: Gameplay and framework classifications with real-time mod counts.
- **Interactive Card Pills**: Click any tag pill on a mod card to instantly toggle its include filter.

---

## 🎮 Multi-Game & Multi-Folder Profiles

Switch between multiple games and mod installations effortlessly:
- **Navbar Switcher**: Use the **🎮 Profile Selector** in the top navigation bar to switch active games and directories on the fly.
- **Settings Manager**: Under **Settings > Game & Mod Folder Profiles**, easily create, edit, or delete profiles. Includes 1-click presets for:
  - **RimWorld** (App ID `294100`)
  - **Stellaris** (App ID `281990`)
  - **Cities: Skylines** (App ID `255710`)
  - **Project Zomboid** (App ID `108600`)
  - **Garry's Mod** (App ID `4000`)
  - **Don't Starve Together** (App ID `322330`)

---

## 🩺 Mod Folder Healer & Refactorer

Have mods downloaded outside Steam with names like `2009463077` or `Mod 3606988458`?
1. Open the **Folder Refactor / Healer** tab.
2. Click **"🔍 Scan Folder"**.
3. The Healer displays proposed folder renames (e.g. `2009463077` ➔ `Harmony`, `3606988458` ➔ `Nurse Job - Prisoners`).
4. Click **"✨ Refactor & Adopt All"**:
   - The Healer renames the folders to their friendly titles.
   - Generates official `PublishedFileId.txt` and `.lastupdated` files.
   - Immediately brings the mods into the automatic update scanner.

---

## 📦 Building Standalone Executables (Zero-Dependency Shipping)

To ship a single self-contained application folder that users can run without installing Python or dependencies:

### On Windows
Run (Command Prompt / PowerShell):
```cmd
packaging\build_windows.bat
```
Or (Git Bash / MSYS2 / bash):
```bash
./packaging/build_windows.sh
```
Output executable: `dist/RimWorldWorkshopController/RimWorldWorkshopController.exe`.

### On Linux / macOS
Run:
```bash
chmod +x packaging/build_linux.sh
./packaging/build_linux.sh
```
Output executable: `dist/RimWorldWorkshopController/RimWorldWorkshopController`.

---

## 📁 Project Structure

```text
├── main.py                  # CLI entry point & argument parser
├── run.sh / run.bat         # Portable launchers for Linux/macOS and Windows
├── data/                    # Persistent application data
│   ├── settings.json        # User preferences and multi-game profiles
│   └── workshop_cache.json  # Persistent Steam Workshop metadata cache
├── mods/                    # Default target mods directory
├── backups/                 # Automatic zip backups created before updating mods
├── docs/                    # Detailed technical and user documentation
│   └── DOCUMENTATION.md     # Full system architecture, API guide & user manual
├── packaging/               # Standalone distribution build pipeline
│   ├── build.py             # PyInstaller automated packaging script
│   ├── build_linux.sh       # Linux one-click build script
│   ├── build_windows.bat    # Windows batch build script
│   └── build_windows.sh     # Windows bash build script
├── src/
│   ├── api/
│   │   └── routes.py        # FastAPI REST API endpoints & WebSocket handler
│   ├── core/
│   │   ├── config.py        # Settings management & ModFolderProfile models
│   │   ├── metadata_cache.py# Persistent thread-safe Workshop metadata cache
│   │   ├── mod_manager.py   # Mod installation, backup & file manager actions
│   │   ├── mod_refactor.py  # Loose mod discovery & PublishedFileId healer
│   │   ├── mod_scanner.py   # Mod scanner, image detection & tag parser
│   │   ├── steam_api.py     # Steam Web API client & Collection parser
│   │   ├── steamcmd.py      # SteamCMD bootstrapper & subprocess execution
│   │   └── worker_pool.py   # Isolated multi-process parallel download pool
│   ├── server.py            # FastAPI server, static mount & browser launcher
│   └── static/              # Self-contained frontend assets (HTML, CSS, JS)
└── tests/                   # Complete automated pytest test suite (33 tests)
```

---

## 🧪 Running Tests

The test suite covers API routes, isolated workers, SteamCMD wrappers, config persistence, profile management, metadata caching, and mod refactoring:

```bash
.venv/bin/python -m pytest -v tests/
```

Verify frontend JavaScript syntax:
```bash
node --check src/static/app.js
```

---

## 📖 Documentation & API Reference

For deep technical details, full REST API specifications, WebSocket packet schemas, and advanced troubleshooting, see:
👉 [**Full Documentation (`docs/DOCUMENTATION.md`)**](docs/DOCUMENTATION.md)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
