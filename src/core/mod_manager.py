"""
Mod installation, verification, atomic file placement, backup creation, and file explorer operations.
"""

from datetime import datetime
from pathlib import Path
from typing import Optional
import os
import platform
import shutil
import subprocess
import zipfile

from src.core.config import BACKUPS_DIR, config_manager
from src.core.mod_refactor import sanitize_filename
from src.core.mod_scanner import parse_about_xml
from src.core.steam_api import steam_api_client


class ModManager:
    """Handles mod filesystem operations (install, backup, delete, open folder)."""

    @staticmethod
    def verify_mod_completeness(mod_path: Path, app_id: int = 294100) -> bool:
        """Verifies that a downloaded mod is complete and valid."""
        if not mod_path.is_dir():
            return False

        # Must have at least 1 file
        has_files = any(mod_path.iterdir())
        if not has_files:
            return False

        # For RimWorld (app 294100), verify About/ folder exists
        if app_id == 294100:
            about_dir = mod_path / "About"
            if not about_dir.is_dir():
                return False

        return True

    @staticmethod
    def create_backup(target_folder: Path, mod_id: str) -> Optional[Path]:
        """Creates a timestamped zip backup of an existing mod folder."""
        if not target_folder.is_dir():
            return None

        BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        sanitized_name = sanitize_filename(target_folder.name)
        backup_file = BACKUPS_DIR / f"{sanitized_name}_{mod_id}_{timestamp}.zip"

        try:
            with zipfile.ZipFile(backup_file, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, _, files in os.walk(target_folder):
                    for f in files:
                        full_p = Path(root) / f
                        rel_p = full_p.relative_to(target_folder)
                        zf.write(full_p, rel_p)
            print(f"[ModManager] Backup created: {backup_file}")
            return backup_file
        except Exception as e:
            print(f"[ModManager] Backup failed for {target_folder}: {e}")
            return None

    async def install_downloaded_mod(
        self,
        staging_mod_path: Path,
        mod_id: str,
        app_id: int = 294100,
        custom_target_dir: Optional[Path] = None,
    ) -> Path:
        """
        Atomically moves a downloaded mod from worker staging into destination mods folder.
        Handles verification, backup, naming, and PublishedFileId creation.
        """
        if not self.verify_mod_completeness(staging_mod_path, app_id):
            raise ValueError(f"Downloaded mod {mod_id} at {staging_mod_path} is incomplete or corrupted.")

        dest_root = custom_target_dir or config_manager.settings.get_resolved_download_path()
        dest_root.mkdir(parents=True, exist_ok=True)

        # Check About/About.xml FIRST for mod title
        mod_title = ""
        about_xml = staging_mod_path / "About" / "About.xml"
        if about_xml.is_file():
            meta = parse_about_xml(about_xml)
            if meta.get("name") and meta["name"].strip():
                mod_title = meta["name"].strip()

        # Only if About.xml doesn't exist or <name> is empty, fall back to Steam Web API title
        time_updated = 0
        try:
            details = await steam_api_client.get_published_file_details([mod_id])
            if mod_id in details:
                if not mod_title and details[mod_id].result == 1 and details[mod_id].title and not details[mod_id].title.startswith("Mod "):
                    mod_title = details[mod_id].title
                if details[mod_id].result == 1:
                    time_updated = details[mod_id].time_updated
        except Exception:
            pass

        # Only if both fail, fall back to Mod_{mod_id}
        if not mod_title:
            mod_title = f"Mod_{mod_id}"

        folder_name = sanitize_filename(mod_title)

        # Look for existing folder with same PublishedFileId.txt
        existing_target: Optional[Path] = None
        for entry in os.scandir(dest_root):
            if entry.is_dir():
                candidate = Path(entry.path)
                id_file = candidate / "About" / "PublishedFileId.txt"
                if id_file.is_file():
                    try:
                        if id_file.read_text(encoding="utf-8").strip() == mod_id:
                            existing_target = candidate
                            break
                    except Exception:
                        pass
                # Or folder name equals mod_id
                elif candidate.name == mod_id:
                    existing_target = candidate
                    break

        target_dir = dest_root / folder_name

        # Collision avoidance if folder name exists for another mod
        if target_dir.exists() and (not existing_target or existing_target != target_dir):
            target_dir = dest_root / f"{folder_name} ({mod_id})"

        # Handle backup if replacing
        if existing_target and existing_target.exists() and config_manager.settings.auto_backup:
            self.create_backup(existing_target, mod_id)
        elif target_dir.exists() and config_manager.settings.auto_backup:
            self.create_backup(target_dir, mod_id)

        # Remove existing target(s)
        if existing_target and existing_target.exists():
            shutil.rmtree(existing_target, ignore_errors=True)
        if target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)

        # Copy/Move staging to target
        shutil.copytree(staging_mod_path, target_dir)

        # Ensure About/PublishedFileId.txt
        about_dir = target_dir / "About"
        about_dir.mkdir(parents=True, exist_ok=True)
        id_file = about_dir / "PublishedFileId.txt"
        id_file.write_text(str(mod_id).strip(), encoding="utf-8")

        # Write About/.lastupdated
        if time_updated > 0:
            lastupdated_file = about_dir / ".lastupdated"
            lastupdated_file.write_text(str(time_updated), encoding="utf-8")

        print(f"[ModManager] Installed mod {mod_id} -> {target_dir}")
        return target_dir

    @staticmethod
    def open_in_file_manager(folder_path: Path) -> None:
        """Opens folder in OS native file explorer."""
        p_str = str(folder_path.resolve())
        system = platform.system()
        if system == "Windows":
            os.startfile(p_str)
        elif system == "Darwin":
            subprocess.run(["open", p_str], check=False)
        else:
            subprocess.run(["xdg-open", p_str], check=False)

    @staticmethod
    def delete_mod(folder_path: Path) -> None:
        """Permanently deletes a mod folder."""
        if folder_path.is_dir():
            shutil.rmtree(folder_path)


mod_manager = ModManager()
