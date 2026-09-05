"""
Configuration management for Steam Workshop Downloader Controller.
Handles persistent settings saved to data/settings.json.
"""

from pathlib import Path
from typing import Any, List, Optional
import json
import os
import sys
from pydantic import BaseModel, Field

# Base application directory (handles PyInstaller bundle or local source directory)
if getattr(sys, "frozen", False):
    APP_DIR = Path(sys.executable).resolve().parent
else:
    APP_DIR = Path(__file__).resolve().parent.parent.parent

DATA_DIR = APP_DIR / "data"
SETTINGS_FILE = DATA_DIR / "settings.json"
DEFAULT_MODS_DIR = APP_DIR / "mods"
BACKUPS_DIR = APP_DIR / "backups"
TEMP_WORKERS_DIR = APP_DIR / "temp_workers"


class ModFolderProfile(BaseModel):
    id: str = "default"
    name: str = "RimWorld"
    app_id: int = 294100
    folder_path: str = ""
    steam_user: str = "anonymous"


class AppSettings(BaseModel):
    download_path: str = Field(
        default="",
        description="Target mods folder. If empty, defaults to 'mods' next to program.",
    )
    max_parallel_workers: int = Field(
        default=3,
        ge=1,
        le=8,
        description="Number of parallel SteamCMD download workers.",
    )
    app_id: int = Field(
        default=294100,
        description="Target Steam App ID (default: 294100 for RimWorld).",
    )
    game_name: str = Field(
        default="RimWorld",
        description="Display name of the game.",
    )
    steam_user: str = Field(
        default="anonymous",
        description="Steam username ('anonymous' by default).",
    )
    steam_pass: str = Field(
        default="",
        description="Steam password if not anonymous.",
    )
    auto_backup: bool = Field(
        default=True,
        description="Create a zip backup in backups/ before overwriting an existing mod.",
    )
    web_port: int = Field(
        default=8080,
        ge=1024,
        le=65535,
        description="Local web server port.",
    )
    auto_open_browser: bool = Field(
        default=True,
        description="Automatically open default web browser on launch.",
    )
    steamcmd_custom_path: Optional[str] = Field(
        default="",
        description="Optional custom path to steamcmd executable.",
    )
    active_profile_id: str = Field(
        default="default",
        description="Currently active mod folder profile ID.",
    )
    profiles: List[ModFolderProfile] = Field(
        default_factory=list,
        description="List of configured game/folder profiles.",
    )

    def model_post_init(self, __context: Any) -> None:
        if not self.profiles:
            self.active_profile_id = self.active_profile_id or "default"
            default_profile = ModFolderProfile(
                id=self.active_profile_id,
                name=self.game_name or "RimWorld",
                app_id=self.app_id or 294100,
                folder_path=self.download_path or "",
                steam_user=self.steam_user or "anonymous",
            )
            self.profiles = [default_profile]
        else:
            active = next((p for p in self.profiles if p.id == self.active_profile_id), None)
            if not active:
                self.active_profile_id = self.profiles[0].id

    def get_active_profile(self) -> ModFolderProfile:
        for p in self.profiles:
            if p.id == self.active_profile_id:
                return p
        if self.profiles:
            return self.profiles[0]
        default_prof = ModFolderProfile(
            id=self.active_profile_id or "default",
            name=self.game_name or "RimWorld",
            app_id=self.app_id or 294100,
            folder_path=self.download_path or "",
            steam_user=self.steam_user or "anonymous",
        )
        self.profiles.append(default_prof)
        return default_prof

    def get_resolved_download_path(self) -> Path:
        """Returns the resolved directory of the active profile (or fallback to default mods dir). Ensures directory exists."""
        active = self.get_active_profile()
        target = active.folder_path.strip() if active.folder_path else self.download_path.strip()
        if target:
            path = Path(target).expanduser().resolve()
        elif active.name and active.name.lower() != "rimworld" and active.id != "default":
            path = (DEFAULT_MODS_DIR / active.name).resolve()
        else:
            path = DEFAULT_MODS_DIR.resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    def switch_profile(self, profile_id: str) -> Optional[ModFolderProfile]:
        """Sets active_profile_id, synchronizes app_id, game_name, download_path, and steam_user to match the active profile."""
        target = next((p for p in self.profiles if p.id == profile_id), None)
        if not target:
            return None
        self.active_profile_id = target.id
        self.app_id = target.app_id
        self.game_name = target.name
        self.download_path = target.folder_path
        self.steam_user = target.steam_user
        return target

    def add_or_update_profile(self, profile: ModFolderProfile) -> None:
        """Adds or updates the profile in profiles."""
        for idx, p in enumerate(self.profiles):
            if p.id == profile.id:
                self.profiles[idx] = profile
                if self.active_profile_id == profile.id:
                    self.app_id = profile.app_id
                    self.game_name = profile.name
                    self.download_path = profile.folder_path
                    self.steam_user = profile.steam_user
                return
        self.profiles.append(profile)

    def delete_profile(self, profile_id: str) -> bool:
        """Deletes profile if not the only one remaining. If deleting active profile, switches to another profile."""
        if len(self.profiles) <= 1:
            return False
        target_idx = next((i for i, p in enumerate(self.profiles) if p.id == profile_id), None)
        if target_idx is None:
            return False
        self.profiles.pop(target_idx)
        if self.active_profile_id == profile_id:
            new_active = self.profiles[0]
            self.switch_profile(new_active.id)
        return True


class ConfigManager:
    """Singleton manager for loading, updating, and saving configuration."""

    def __init__(self, settings_path: Optional[Path] = None):
        self.settings_path = settings_path or SETTINGS_FILE
        self._settings: AppSettings = self._load()

    @property
    def settings(self) -> AppSettings:
        return self._settings

    def _load(self) -> AppSettings:
        if self.settings_path.exists():
            try:
                with open(self.settings_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return AppSettings(**data)
            except Exception as e:
                print(f"[Config] Error reading settings from {self.settings_path}: {e}. Using defaults.")
        return AppSettings()

    def save(self) -> None:
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.settings_path, "w", encoding="utf-8") as f:
            json.dump(self._settings.model_dump(), f, indent=2)

    def update(self, new_settings: dict) -> AppSettings:
        current_data = self._settings.model_dump()
        for k, v in new_settings.items():
            if k in current_data and v is not None:
                current_data[k] = v

        # Synchronize active profile if app_id, game_name, download_path, or steam_user changed
        active_id = current_data.get("active_profile_id", "default")
        profiles_data = current_data.get("profiles", [])
        for p in profiles_data:
            if isinstance(p, dict) and p.get("id") == active_id:
                if "app_id" in new_settings and new_settings["app_id"] is not None:
                    p["app_id"] = new_settings["app_id"]
                if "game_name" in new_settings and new_settings["game_name"] is not None:
                    p["name"] = new_settings["game_name"]
                if "download_path" in new_settings and new_settings["download_path"] is not None:
                    p["folder_path"] = new_settings["download_path"]
                if "steam_user" in new_settings and new_settings["steam_user"] is not None:
                    p["steam_user"] = new_settings["steam_user"]
                break

        self._settings = AppSettings(**current_data)
        self.save()
        return self._settings

    def get_active_profile(self) -> ModFolderProfile:
        return self._settings.get_active_profile()

    def get_resolved_download_path(self) -> Path:
        return self._settings.get_resolved_download_path()

    def switch_profile(self, profile_id: str) -> Optional[ModFolderProfile]:
        prof = self._settings.switch_profile(profile_id)
        if prof:
            self.save()
        return prof

    def add_or_update_profile(self, profile: ModFolderProfile) -> None:
        self._settings.add_or_update_profile(profile)
        self.save()

    def delete_profile(self, profile_id: str) -> bool:
        deleted = self._settings.delete_profile(profile_id)
        if deleted:
            self.save()
        return deleted


# Global singleton instance
config_manager = ConfigManager()
