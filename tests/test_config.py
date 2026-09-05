import os
import tempfile
from pathlib import Path
import pytest
from src.core.config import AppSettings, ConfigManager, DEFAULT_MODS_DIR, ModFolderProfile


def test_default_settings():
    settings = AppSettings()
    assert settings.app_id == 294100
    assert settings.game_name == "RimWorld"
    assert settings.max_parallel_workers == 3
    assert settings.steam_user == "anonymous"
    assert settings.auto_backup is True
    assert settings.auto_open_browser is True

    # Profile migration verification
    assert settings.active_profile_id == "default"
    assert len(settings.profiles) == 1
    active_prof = settings.get_active_profile()
    assert active_prof.id == "default"
    assert active_prof.name == "RimWorld"
    assert active_prof.app_id == 294100

    resolved = settings.get_resolved_download_path()
    assert resolved == DEFAULT_MODS_DIR.resolve()


def test_custom_download_path(tmp_path):
    custom_dir = tmp_path / "my_custom_mods"
    settings = AppSettings(download_path=str(custom_dir))
    resolved = settings.get_resolved_download_path()
    assert resolved == custom_dir.resolve()
    assert custom_dir.is_dir()


def test_config_manager_persistence(tmp_path):
    settings_file = tmp_path / "settings.json"
    mgr = ConfigManager(settings_path=settings_file)

    assert mgr.settings.app_id == 294100
    mgr.update({"app_id": 281990, "game_name": "Stellaris", "max_parallel_workers": 4})

    assert mgr.settings.app_id == 281990
    assert mgr.settings.game_name == "Stellaris"
    assert mgr.settings.max_parallel_workers == 4

    # Reload from file
    mgr2 = ConfigManager(settings_path=settings_file)
    assert mgr2.settings.app_id == 281990
    assert mgr2.settings.game_name == "Stellaris"
    assert mgr2.settings.max_parallel_workers == 4


def test_mod_folder_profiles(tmp_path):
    settings_file = tmp_path / "settings.json"
    mgr = ConfigManager(settings_path=settings_file)

    # Initial default profile
    default_p = mgr.get_active_profile()
    assert default_p.id == "default"
    assert default_p.name == "RimWorld"

    # Add new profile for Stellaris
    stellaris_dir = tmp_path / "stellaris_mods"
    stellaris_p = ModFolderProfile(
        id="stellaris",
        name="Stellaris",
        app_id=281990,
        folder_path=str(stellaris_dir),
        steam_user="anonymous",
    )
    mgr.add_or_update_profile(stellaris_p)
    assert len(mgr.settings.profiles) == 2

    # Switch to Stellaris profile
    switched = mgr.switch_profile("stellaris")
    assert switched is not None
    assert switched.id == "stellaris"
    assert mgr.settings.active_profile_id == "stellaris"
    assert mgr.settings.app_id == 281990
    assert mgr.settings.game_name == "Stellaris"
    assert mgr.settings.download_path == str(stellaris_dir)
    assert mgr.get_resolved_download_path() == stellaris_dir.resolve()

    # Reload from disk and verify persistence
    mgr_reloaded = ConfigManager(settings_path=settings_file)
    assert mgr_reloaded.settings.active_profile_id == "stellaris"
    assert mgr_reloaded.settings.app_id == 281990
    assert mgr_reloaded.settings.game_name == "Stellaris"
    assert len(mgr_reloaded.settings.profiles) == 2

    # Update profile in-place
    stellaris_updated = ModFolderProfile(
        id="stellaris",
        name="Stellaris Modded",
        app_id=281990,
        folder_path=str(stellaris_dir),
        steam_user="anonymous",
    )
    mgr_reloaded.add_or_update_profile(stellaris_updated)
    assert mgr_reloaded.settings.game_name == "Stellaris Modded"

    # Try deleting active profile (stellaris) -> switches to remaining profile (default)
    deleted = mgr_reloaded.delete_profile("stellaris")
    assert deleted is True
    assert mgr_reloaded.settings.active_profile_id == "default"
    assert mgr_reloaded.settings.app_id == 294100
    assert len(mgr_reloaded.settings.profiles) == 1

    # Cannot delete the only remaining profile
    assert mgr_reloaded.delete_profile("default") is False
    assert len(mgr_reloaded.settings.profiles) == 1
