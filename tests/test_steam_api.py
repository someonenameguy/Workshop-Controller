import pytest
from src.core.steam_api import steam_api_client, ModWorkshopDetails


@pytest.mark.asyncio
async def test_parse_input_text_single_and_multi_ids():
    text = """
    https://steamcommunity.com/sharedfiles/filedetails/?id=2009463077
    818773962, 735106432
    https://steamcommunity.com/workshop/filedetails/?id=2878346181
    """
    mod_ids, collections = await steam_api_client.parse_input_text(text)
    assert "2009463077" in mod_ids
    assert "818773962" in mod_ids
    assert "735106432" in mod_ids
    assert "2878346181" in mod_ids
    assert len(collections) == 0


@pytest.mark.asyncio
async def test_parse_input_text_empty():
    mod_ids, collections = await steam_api_client.parse_input_text("")
    assert mod_ids == []
    assert collections == []


def test_mod_workshop_details_model():
    details = ModWorkshopDetails(
        publishedfileid="2009463077",
        title="Harmony",
        time_updated=1690000000,
        file_size=512000,
    )
    assert details.publishedfileid == "2009463077"
    assert details.title == "Harmony"
    assert details.result == 1
    assert details.banned is False
