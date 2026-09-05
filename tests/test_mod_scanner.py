import pytest
from pathlib import Path
from src.core.metadata_cache import metadata_cache
from src.core.mod_scanner import (
    find_preview_image,
    get_local_mod_timestamp,
    mod_scanner,
    parse_about_xml,
)


def test_parse_about_xml(tmp_path):
    about_file = tmp_path / "About.xml"
    xml_content = """<?xml version="1.0" encoding="utf-8"?>
    <ModMetaData>
      <name>Awesome Mod</name>
      <author>ModderName</author>
      <packageId>author.awesomemod</packageId>
      <url>https://steamcommunity.com/sharedfiles/filedetails/?id=123456789</url>
      <description>An awesome test mod description.</description>
      <supportedVersions>
        <li>1.4</li>
        <li>1.5</li>
      </supportedVersions>
    </ModMetaData>
    """
    about_file.write_text(xml_content, encoding="utf-8")

    meta = parse_about_xml(about_file)
    assert meta["name"] == "Awesome Mod"
    assert meta["author"] == "ModderName"
    assert meta["packageId"] == "author.awesomemod"
    assert "123456789" in meta["url"]
    assert meta["supported_versions"] == ["1.4", "1.5"]


def test_find_preview_image(tmp_path):
    mod_folder = tmp_path / "ModWithPreview"
    about_dir = mod_folder / "About"
    about_dir.mkdir(parents=True)

    # Empty initially
    assert find_preview_image(mod_folder) is None

    # Test preview.webp in About
    preview_file = about_dir / "Preview.webp"
    preview_file.write_bytes(b"dummy")
    assert find_preview_image(mod_folder) == str(preview_file.resolve())

    # Test ModIcon.png in root
    mod_root_icon = tmp_path / "ModRootIcon"
    mod_root_icon.mkdir()
    icon_file = mod_root_icon / "ModIcon.png"
    icon_file.write_bytes(b"dummy")
    assert find_preview_image(mod_root_icon) == str(icon_file.resolve())


def test_get_local_mod_timestamp(tmp_path):
    mod_folder = tmp_path / "TestMod"
    about_dir = mod_folder / "About"
    about_dir.mkdir(parents=True)

    # Test .lastupdated file
    lastupdated = about_dir / ".lastupdated"
    lastupdated.write_text("1700000000", encoding="utf-8")

    ts = get_local_mod_timestamp(mod_folder)
    assert ts == 1700000000


@pytest.mark.asyncio
async def test_scan_installed_mods(tmp_path):
    # Setup simulated mods folder
    mods_dir = tmp_path / "mods"
    mods_dir.mkdir()

    # Mod 1: Steam Workshop mod with PublishedFileId.txt
    mod1 = mods_dir / "Harmony"
    about1 = mod1 / "About"
    about1.mkdir(parents=True)
    (about1 / "PublishedFileId.txt").write_text("2009463077", encoding="utf-8")
    (about1 / "About.xml").write_text("<ModMetaData><name>Harmony</name><author>pardeike</author><supportedVersions><li>1.5</li></supportedVersions></ModMetaData>", encoding="utf-8")
    (about1 / ".lastupdated").write_text("1695000000", encoding="utf-8")

    # Mod 2: Non-Steam / Local mod
    mod2 = mods_dir / "LocalTestMod"
    about2 = mod2 / "About"
    about2.mkdir(parents=True)
    (about2 / "About.xml").write_text("<ModMetaData><name>Local Mod</name></ModMetaData>", encoding="utf-8")

    # Scan without online check
    installed = await mod_scanner.scan_installed_mods(custom_path=mods_dir, check_online=False)

    assert len(installed) == 2
    mod1_found = next(m for m in installed if m.folder_name == "Harmony")
    assert mod1_found.mod_id == "2009463077"
    assert mod1_found.name == "Harmony"
    assert mod1_found.author == "pardeike"
    assert mod1_found.is_non_steam is False
    assert mod1_found.local_updated_time == 1695000000
    assert "1.5" in mod1_found.tags

    mod2_found = next(m for m in installed if m.folder_name == "LocalTestMod")
    assert mod2_found.is_non_steam is True


@pytest.mark.asyncio
async def test_scan_installed_mods_uses_metadata_cache(tmp_path):
    mods_dir = tmp_path / "mods"
    mods_dir.mkdir()

    # Pre-populate metadata_cache
    cached_id = "999888777"
    metadata_cache.set(cached_id, {
        "title": "Cached Super Mod",
        "preview_url": "https://images.steam.test/preview.jpg",
        "tags": ["1.5", "Quality of Life"],
        "time_updated": 1710000000,
    })

    # Create folder named 999888777 without About.xml
    mod_dir = mods_dir / cached_id
    mod_dir.mkdir()
    about_dir = mod_dir / "About"
    about_dir.mkdir()
    (about_dir / "PublishedFileId.txt").write_text(cached_id, encoding="utf-8")
    (about_dir / ".lastupdated").write_text("1700000000", encoding="utf-8")

    # Scan with check_online=False -> should read entirely from cache
    installed = await mod_scanner.scan_installed_mods(custom_path=mods_dir, check_online=False)
    assert len(installed) == 1
    scanned = installed[0]
    assert scanned.mod_id == cached_id
    assert scanned.name == "Cached Super Mod"
    assert scanned.preview_url == "https://images.steam.test/preview.jpg"
    assert "Quality of Life" in scanned.tags
    assert scanned.remote_updated_time == 1710000000


@pytest.mark.asyncio
async def test_scan_installed_mods_result_9_preserves_about_xml_names(tmp_path):
    mods_dir = tmp_path / "mods"
    mods_dir.mkdir()

    # Mod 1: 3606988458 -> Nurse Job - Prisoners
    mod1 = mods_dir / "Nurse Job - Prisoners"
    about1 = mod1 / "About"
    about1.mkdir(parents=True)
    (about1 / "PublishedFileId.txt").write_text("3606988458", encoding="utf-8")
    (about1 / "About.xml").write_text("<ModMetaData><name>Nurse Job - Prisoners</name></ModMetaData>", encoding="utf-8")

    # Mod 2: 3244733349 -> Personal Doors
    mod2 = mods_dir / "Personal Doors"
    about2 = mod2 / "About"
    about2.mkdir(parents=True)
    (about2 / "PublishedFileId.txt").write_text("3244733349", encoding="utf-8")
    (about2 / "About.xml").write_text("<ModMetaData><name>Personal Doors</name></ModMetaData>", encoding="utf-8")

    # Scan with online check enabled (Steam API returns result=9 for both)
    installed = await mod_scanner.scan_installed_mods(custom_path=mods_dir, check_online=True)
    assert len(installed) == 2
    names = {m.mod_id: m.name for m in installed}
    assert names["3606988458"] == "Nurse Job - Prisoners"
    assert names["3244733349"] == "Personal Doors"
