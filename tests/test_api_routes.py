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


