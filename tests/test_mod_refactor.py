import pytest
from pathlib import Path
from httpx import ASGITransport, AsyncClient
from src.server import create_app
from src.core.mod_refactor import mod_refactorer, sanitize_filename


def test_sanitize_filename():
    assert sanitize_filename("Mod: Name / Special * Characters?") == "Mod Name Special Characters"
    assert sanitize_filename("   Spaces   ") == "Spaces"
    assert sanitize_filename("") == "Mod"
    assert sanitize_filename("A" * 150) == "A" * 120


@pytest.mark.asyncio
async def test_scan_and_execute_refactor_raw_id_to_title(tmp_path):
    target_dir = tmp_path / "messy_mods"
    target_dir.mkdir()

    # Create a loose mod folder named with a raw ID (2009463077)
    loose_mod = target_dir / "2009463077"
    about = loose_mod / "About"
    about.mkdir(parents=True)
    (about / "About.xml").write_text(
        """<ModMetaData>
        <name>Harmony</name>
        <url>https://steamcommunity.com/sharedfiles/filedetails/?id=2009463077</url>
        </ModMetaData>""",
        encoding="utf-8",
    )

    # 1. Scan for refactoring
    candidates = await mod_refactorer.scan_folder_for_refactor(target_dir)
    assert len(candidates) == 1
    c = candidates[0]
    assert c.folder_name == "2009463077"
    assert c.detected_mod_id == "2009463077"
    assert c.has_published_file_id is False
    assert c.folder_name_matches is False
    assert c.needs_refactor is True
    assert c.can_refactor is True
    assert c.proposed_folder_name == "Harmony"

    # 2. Execute refactoring: raw ID should be renamed to mod title "Harmony"
    result = await mod_refactorer.execute_refactor(
        folder_path=c.folder_path,
        mod_id="2009463077",
        rename_folder=True,
        force_title="Harmony",
    )
    assert result["status"] == "success"
    assert result["folder_name"] == "Harmony"

    new_path = Path(result["new_path"])
    assert new_path.is_dir()
    assert new_path.name == "Harmony"
    # Old raw ID folder must no longer exist
    assert not (target_dir / "2009463077").exists()

    id_file = new_path / "About" / "PublishedFileId.txt"
    assert id_file.is_file()
    assert id_file.read_text(encoding="utf-8").strip() == "2009463077"


@pytest.mark.asyncio
async def test_refactor_already_has_published_file_id_renames_to_title(tmp_path):
    target_dir = tmp_path / "id_mods"
    target_dir.mkdir()

    # Mod already has PublishedFileId.txt but its folder name is raw ID "2009463077"
    mod_folder = target_dir / "2009463077"
    about = mod_folder / "About"
    about.mkdir(parents=True)
    (about / "PublishedFileId.txt").write_text("2009463077\n", encoding="utf-8")
    (about / "About.xml").write_text(
        """<ModMetaData>
        <name>Harmony</name>
        <packageId>brrainz.harmony</packageId>
        </ModMetaData>""",
        encoding="utf-8",
    )

    # 1. Scan: even though it has PublishedFileId.txt, folder name is numeric ID
    candidates = await mod_refactorer.scan_folder_for_refactor(target_dir)
    assert len(candidates) == 1
    c = candidates[0]
    assert c.has_published_file_id is True
    assert c.folder_name == "2009463077"
    assert c.proposed_folder_name == "Harmony"
    assert c.folder_name_matches is False
    # can_refactor MUST be True and needs_refactor MUST be True
    assert c.can_refactor is True
    assert c.needs_refactor is True

    # 2. Execute refactoring
    result = await mod_refactorer.execute_refactor(
        folder_path=c.folder_path,
        mod_id=c.detected_mod_id,
        rename_folder=True,
    )
    assert result["status"] == "success"
    assert result["folder_name"] == "Harmony"

    new_path = Path(result["new_path"])
    assert new_path.is_dir()
    assert new_path.name == "Harmony"
    assert not (target_dir / "2009463077").exists()
    assert (new_path / "About" / "PublishedFileId.txt").read_text(encoding="utf-8").strip() == "2009463077"


@pytest.mark.asyncio
async def test_needs_refactor_criteria_missing_lastupdated_and_healthy(tmp_path):
    target_dir = tmp_path / "criteria_mods"
    target_dir.mkdir()

    # Mod 1: Folder name matches ("Harmony"), has PublishedFileId.txt, but MISSING .lastupdated
    mod1 = target_dir / "Harmony"
    about1 = mod1 / "About"
    about1.mkdir(parents=True)
    (about1 / "PublishedFileId.txt").write_text("2009463077", encoding="utf-8")
    (about1 / "About.xml").write_text("<ModMetaData><name>Harmony</name></ModMetaData>", encoding="utf-8")

    # Mod 2: Folder name matches ("Core"), has PublishedFileId.txt, AND HAS .lastupdated
    mod2 = target_dir / "CoreMod"
    about2 = mod2 / "About"
    about2.mkdir(parents=True)
    (about2 / "PublishedFileId.txt").write_text("11111111", encoding="utf-8")
    (about2 / ".lastupdated").write_text("1680000000", encoding="utf-8")
    (about2 / "About.xml").write_text("<ModMetaData><name>CoreMod</name></ModMetaData>", encoding="utf-8")

    candidates = await mod_refactorer.scan_folder_for_refactor(target_dir)
    c_map = {c.folder_name: c for c in candidates}

    # Mod 1 needs refactor due to missing .lastupdated
    c1 = c_map["Harmony"]
    assert c1.has_published_file_id is True
    assert c1.folder_name_matches is True
    assert c1.has_last_updated is False
    assert c1.needs_refactor is True
    assert c1.can_refactor is True

    # Mod 2 is healthy (has id, has lastupdated, folder matches)
    c2 = c_map["CoreMod"]
    assert c2.has_published_file_id is True
    assert c2.folder_name_matches is True
    assert c2.has_last_updated is True
    assert c2.needs_refactor is False
    assert c2.can_refactor is False


@pytest.mark.asyncio
async def test_refactor_without_mod_id_renames_from_about_xml(tmp_path):
    target_dir = tmp_path / "local_mods"
    target_dir.mkdir()

    # Mod folder has no Workshop ID at all, but has About.xml with title
    mod_folder = target_dir / "random_folder_name_123"
    about = mod_folder / "About"
    about.mkdir(parents=True)
    (about / "About.xml").write_text(
        """<ModMetaData>
        <name>Combat Extended</name>
        <author>CE Team</author>
        </ModMetaData>""",
        encoding="utf-8",
    )

    candidates = await mod_refactorer.scan_folder_for_refactor(target_dir)
    assert len(candidates) == 1
    c = candidates[0]
    assert c.detected_mod_id is None
    assert c.title == "Combat Extended"
    assert c.proposed_folder_name == "Combat Extended"
    assert c.folder_name_matches is False
    assert c.needs_refactor is True
    assert c.can_refactor is True

    # Execute refactoring without mod_id
    result = await mod_refactorer.execute_refactor(
        folder_path=c.folder_path,
        mod_id=None,
        rename_folder=True,
    )
    assert result["status"] == "success"
    assert result["folder_name"] == "Combat Extended"
    new_path = Path(result["new_path"])
    assert new_path.is_dir()
    assert new_path.name == "Combat Extended"
    assert not (target_dir / "random_folder_name_123").exists()


@pytest.mark.asyncio
async def test_refactor_case_sensitivity_rename(tmp_path):
    target_dir = tmp_path / "case_mods"
    target_dir.mkdir()

    mod_folder = target_dir / "harmony"
    about = mod_folder / "About"
    about.mkdir(parents=True)
    (about / "About.xml").write_text(
        """<ModMetaData><name>Harmony</name></ModMetaData>""",
        encoding="utf-8",
    )

    result = await mod_refactorer.execute_refactor(
        folder_path=str(mod_folder),
        mod_id=None,
        rename_folder=True,
        force_title="Harmony",
    )
    assert result["status"] == "success"
    assert result["folder_name"] == "Harmony"
    assert Path(result["new_path"]).name == "Harmony"


@pytest.mark.asyncio
async def test_refactor_collision_handling(tmp_path):
    target_dir = tmp_path / "collision_mods"
    target_dir.mkdir()

    # Pre-existing folder named Harmony
    existing_harmony = target_dir / "Harmony"
    existing_harmony.mkdir()
    (existing_harmony / "existing_marker.txt").write_text("keep_me", encoding="utf-8")

    # New mod folder named 2009463077 that wants to be named Harmony
    new_mod = target_dir / "2009463077"
    about = new_mod / "About"
    about.mkdir(parents=True)
    (about / "About.xml").write_text(
        """<ModMetaData><name>Harmony</name></ModMetaData>""",
        encoding="utf-8",
    )

    result = await mod_refactorer.execute_refactor(
        folder_path=str(new_mod),
        mod_id="2009463077",
        rename_folder=True,
        force_title="Harmony",
    )
    assert result["status"] == "success"
    # Should rename to "Harmony (2009463077)" to avoid colliding with existing folder
    assert result["folder_name"] == "Harmony (2009463077)"
    assert Path(result["new_path"]).is_dir()

    # Verify original existing folder is completely intact
    assert existing_harmony.exists()
    assert (existing_harmony / "existing_marker.txt").read_text(encoding="utf-8") == "keep_me"


@pytest.mark.asyncio
async def test_api_refactor_execute_endpoint(tmp_path):
    target_dir = tmp_path / "api_refactor_mods"
    target_dir.mkdir()

    mod1 = target_dir / "2009463077"
    (mod1 / "About").mkdir(parents=True)
    (mod1 / "About" / "About.xml").write_text("<ModMetaData><name>Harmony</name></ModMetaData>")

    mod2 = target_dir / "ce_mod"
    (mod2 / "About").mkdir(parents=True)
    (mod2 / "About" / "About.xml").write_text("<ModMetaData><name>Combat Extended</name></ModMetaData>")

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Test executing refactor with optional mod_id and valid paths
        payload = {
            "items": [
                {
                    "folder_path": str(mod1),
                    "mod_id": "2009463077",
                    "rename_folder": True,
                },
                {
                    "folder_path": str(mod2),
                    "mod_id": None,  # optional mod_id
                    "rename_folder": True,
                },
                {
                    "folder_path": str(target_dir / "non_existent_folder"),
                    "mod_id": None,
                    "rename_folder": True,
                },
            ]
        }
        res = await ac.post("/api/refactor/execute", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "completed"
        assert data["total"] == 3
        assert data["success_count"] == 2
        assert data["error_count"] == 1
        assert len(data["results"]) == 3
        assert data["results"][0]["status"] == "success"
        assert data["results"][1]["status"] == "success"
        assert data["results"][2]["status"] == "error"


@pytest.mark.asyncio
async def test_refactor_nurse_job_prisoners_result_9(tmp_path):
    """
    Test verifying that folder '3606988458' (Steam API result=9) with About.xml
    '<name>Nurse Job - Prisoners</name>' is identified as can_refactor=True,
    needs_refactor=True, proposed_folder_name='Nurse Job - Prisoners', and executing
    refactor successfully renames the folder to 'Nurse Job - Prisoners'.
    """
    target_dir = tmp_path / "nurse_job_mods"
    target_dir.mkdir()

    loose_mod = target_dir / "3606988458"
    about = loose_mod / "About"
    about.mkdir(parents=True)
    (about / "About.xml").write_text(
        """<ModMetaData>
        <name>Nurse Job - Prisoners</name>
        <author>Modder</author>
        <packageId>nursejob.prisoners</packageId>
        </ModMetaData>""",
        encoding="utf-8",
    )

    candidates = await mod_refactorer.scan_folder_for_refactor(target_dir)
    assert len(candidates) == 1
    c = candidates[0]
    assert c.folder_name == "3606988458"
    assert c.detected_mod_id == "3606988458"
    assert c.can_refactor is True
    assert c.needs_refactor is True
    assert c.proposed_folder_name == "Nurse Job - Prisoners"
    assert "Nurse Job - Prisoners" in c.status_message

    result = await mod_refactorer.execute_refactor(
        folder_path=c.folder_path,
        mod_id=c.detected_mod_id,
        rename_folder=True,
    )
    assert result["status"] == "success"
    assert result["folder_name"] == "Nurse Job - Prisoners"

    new_path = Path(result["new_path"])
    assert new_path.is_dir()
    assert new_path.name == "Nurse Job - Prisoners"
    assert not (target_dir / "3606988458").exists()

    id_file = new_path / "About" / "PublishedFileId.txt"
    assert id_file.is_file()
    assert id_file.read_text(encoding="utf-8").strip() == "3606988458"


@pytest.mark.asyncio
async def test_refactor_personal_doors_result_9(tmp_path):
    """
    Test verifying that folder '3244733349' (Steam API result=9) with About.xml
    '<name>Personal Doors</name>' is identified as can_refactor=True,
    needs_refactor=True, proposed_folder_name='Personal Doors', and executing
    refactor successfully renames the folder to 'Personal Doors'.
    """
    target_dir = tmp_path / "doors_mods"
    target_dir.mkdir()

    loose_mod = target_dir / "3244733349"
    about = loose_mod / "About"
    about.mkdir(parents=True)
    (about / "About.xml").write_text(
        """<ModMetaData>
        <name>Personal Doors</name>
        <author>Modder</author>
        <packageId>personal.doors</packageId>
        </ModMetaData>""",
        encoding="utf-8",
    )

    candidates = await mod_refactorer.scan_folder_for_refactor(target_dir)
    assert len(candidates) == 1
    c = candidates[0]
    assert c.folder_name == "3244733349"
    assert c.detected_mod_id == "3244733349"
    assert c.can_refactor is True
    assert c.needs_refactor is True
    assert c.proposed_folder_name == "Personal Doors"
    assert "Personal Doors" in c.status_message

    result = await mod_refactorer.execute_refactor(
        folder_path=c.folder_path,
        mod_id=c.detected_mod_id,
        rename_folder=True,
    )
    assert result["status"] == "success"
    assert result["folder_name"] == "Personal Doors"

    new_path = Path(result["new_path"])
    assert new_path.is_dir()
    assert new_path.name == "Personal Doors"
    assert not (target_dir / "3244733349").exists()

    id_file = new_path / "About" / "PublishedFileId.txt"
    assert id_file.is_file()
    assert id_file.read_text(encoding="utf-8").strip() == "3244733349"


@pytest.mark.asyncio
async def test_mod_manager_install_downloaded_mod_result_9(tmp_path):
    """
    Verify mod_manager.install_downloaded_mod uses About.xml title for result=9 mods
    instead of raw ID or fallback Mod_{mod_id}.
    """
    from src.core.mod_manager import mod_manager

    staging_dir = tmp_path / "staging_mod"
    about = staging_dir / "About"
    about.mkdir(parents=True)
    (about / "About.xml").write_text(
        "<ModMetaData><name>Nurse Job - Prisoners</name></ModMetaData>",
        encoding="utf-8",
    )

    dest_dir = tmp_path / "dest_mods"
    dest_dir.mkdir()

    installed_path = await mod_manager.install_downloaded_mod(
        staging_mod_path=staging_dir,
        mod_id="3606988458",
        custom_target_dir=dest_dir,
    )
    assert installed_path.name == "Nurse Job - Prisoners"
    assert (installed_path / "About" / "PublishedFileId.txt").read_text(encoding="utf-8").strip() == "3606988458"

