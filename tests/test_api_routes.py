import pytest
from httpx import ASGITransport, AsyncClient
from src.server import create_app


@pytest.mark.asyncio
async def test_api_status_and_settings():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # System status
        res = await ac.get("/api/system/status")
        assert res.status_code == 200
        data = res.json()
        assert "steamcmd_ready" in data
        assert data["game_name"] == "RimWorld"
        assert data["app_id"] == 294100

        # Get settings
        res_settings = await ac.get("/api/settings")
        assert res_settings.status_code == 200
        s_data = res_settings.json()
        assert "settings" in s_data
        assert s_data["settings"]["max_parallel_workers"] >= 1

        # Update settings
        res_update = await ac.post("/api/settings", json={"game_name": "RimWorld Updated"})
        assert res_update.status_code == 200
        assert res_update.json()["settings"]["game_name"] == "RimWorld Updated"

        # Revert game_name
        await ac.post("/api/settings", json={"game_name": "RimWorld"})


@pytest.mark.asyncio
async def test_api_list_mods():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/mods")
        assert res.status_code == 200
        data = res.json()
        assert "mods" in data
        assert isinstance(data["mods"], list)


@pytest.mark.asyncio
async def test_api_download_validation():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Empty input should 400
        res = await ac.post("/api/mods/download", json={"input_text": ""})
        assert res.status_code == 400

        # Invalid text without IDs should 400
        res_invalid = await ac.post("/api/mods/download", json={"input_text": "hello world invalid"})
        assert res_invalid.status_code == 400


@pytest.mark.asyncio
async def test_api_system_shutdown():
    from unittest.mock import patch
    app = create_app()
    transport = ASGITransport(app=app)
    with patch("src.api.routes.threading.Thread"):
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/system/shutdown")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "shutting_down"
            assert "message" in data


@pytest.mark.asyncio
async def test_api_profiles():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Get profiles
        res = await ac.get("/api/profiles")
        assert res.status_code == 200
        p_data = res.json()
        assert "active_profile_id" in p_data
        assert "profiles" in p_data

        # Add profile
        new_prof = {
            "id": "stellaris_test",
            "name": "Stellaris",
            "app_id": 281990,
            "folder_path": "",
            "steam_user": "anonymous",
        }
        res_add = await ac.post("/api/profiles/add-or-update", json={"profile": new_prof})
        assert res_add.status_code == 200

        # Switch profile
        res_sw = await ac.post("/api/profiles/switch", json={"profile_id": "stellaris_test"})
        assert res_sw.status_code == 200
        assert res_sw.json()["active_profile"]["id"] == "stellaris_test"

        # Switch back to default
        res_sw2 = await ac.post("/api/profiles/switch", json={"profile_id": "default"})
        assert res_sw2.status_code == 200

        # Delete stellaris_test profile
        res_del = await ac.post("/api/profiles/delete", json={"profile_id": "stellaris_test"})
        assert res_del.status_code == 200


@pytest.mark.asyncio
async def test_api_mods_retry():
    from src.core.worker_pool import DownloadItem, worker_pool

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Invalid request (neither mod_id nor retry_all)
        res_bad = await ac.post("/api/mods/retry", json={})
        assert res_bad.status_code == 400

        # Mod not found
        res_not_found = await ac.post("/api/mods/retry", json={"mod_id": "999999"})
        assert res_not_found.status_code == 400

        # Add failed item to worker_pool
        item = DownloadItem(mod_id="55555", title="Retryable Mod", status="failed", error="Failed")
        worker_pool.items["55555"] = item

        # Retry single item
        res_retry = await ac.post("/api/mods/retry", json={"mod_id": "55555"})
        assert res_retry.status_code == 200
        assert res_retry.json()["status"] == "success"
        assert res_retry.json()["mod_id"] == "55555"
        assert worker_pool.items["55555"].status == "queued"

        # Retry all failed
        item2 = DownloadItem(mod_id="66666", title="Another Failed Mod", status="failed")
        worker_pool.items["66666"] = item2

        res_retry_all = await ac.post("/api/mods/retry", json={"retry_all": True})
        assert res_retry_all.status_code == 200
        data = res_retry_all.json()
        assert data["status"] == "success"
        assert "66666" in data["retried_ids"]
        assert worker_pool.items["66666"].status == "queued"


@pytest.mark.asyncio
async def test_api_settings_auto_retry():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/settings", json={"auto_retry": False, "max_retries": 4})
        assert res.status_code == 200
        settings = res.json()["settings"]
        assert settings["auto_retry"] is False
        assert settings["max_retries"] == 4

        # Revert
        res_rev = await ac.post("/api/settings", json={"auto_retry": True, "max_retries": 3})
        assert res_rev.status_code == 200
        assert res_rev.json()["settings"]["auto_retry"] is True
        assert res_rev.json()["settings"]["max_retries"] == 3


@pytest.mark.asyncio
async def test_index_page_steam_filter_sidebar():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/")
        assert res.status_code == 200
        html = res.text
        assert 'id="steam-filter-sidebar"' in html
        assert 'id="steam-tags-container"' in html
        assert 'id="mods-search-input"' in html
        assert 'id="btn-reset-filters"' in html
        assert 'id="active-filter-chips"' in html




