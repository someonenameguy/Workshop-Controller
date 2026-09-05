"""
Steam Web API integration and Workshop URL/Collection extractor.
"""

import re
from typing import Dict, List, Optional, Set, Tuple
import httpx
from pydantic import BaseModel, Field

STEAM_API_BASE = "https://api.steampowered.com"


class ModWorkshopDetails(BaseModel):
    publishedfileid: str
    result: int = 1
    title: str = "Unknown Mod"
    description: str = ""
    time_created: int = 0
    time_updated: int = 0
    file_size: int = 0
    preview_url: str = ""
    subscriptions: int = 0
    favorited: int = 0
    views: int = 0
    tags: List[str] = Field(default_factory=list)
    banned: bool = False
    creator_app_id: int = 0
    consumer_app_id: int = 0


class SteamApiClient:
    """Client for Steam Web API and Workshop queries."""

    def __init__(self, timeout: float = 20.0):
        self.timeout = timeout
        self._headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SteamWorkshopController/1.0",
            "Accept": "application/json, text/html",
        }

    async def get_published_file_details(
        self, mod_ids: List[str]
    ) -> Dict[str, ModWorkshopDetails]:
        """
        Batch fetch details for up to 100 mods at a time via ISteamRemoteStorage/GetPublishedFileDetails/v0001/.
        Returns dict keyed by mod ID.
        """
        if not mod_ids:
            return {}

        results: Dict[str, ModWorkshopDetails] = {}
        unique_ids = list(dict.fromkeys(mod_ids))  # preserve order, remove dupes

        # Batch in chunks of 50
        batch_size = 50
        url = f"{STEAM_API_BASE}/ISteamRemoteStorage/GetPublishedFileDetails/v0001/"

        async with httpx.AsyncClient(headers=self._headers, timeout=self.timeout) as client:
            for i in range(0, len(unique_ids), batch_size):
                chunk = unique_ids[i : i + batch_size]
                form_data = {
                    "itemcount": str(len(chunk)),
                    "format": "json",
                }
                for idx, mod_id in enumerate(chunk):
                    form_data[f"publishedfileids[{idx}]"] = str(mod_id)

                try:
                    resp = await client.post(url, data=form_data)
                    if resp.status_code == 200:
                        data = resp.json()
                        items = (
                            data.get("response", {})
                            .get("publishedfiledetails", [])
                        )
                        for item in items:
                            file_id = str(item.get("publishedfileid", ""))
                            if not file_id:
                                continue

                            # Normalize tags
                            raw_tags = item.get("tags", [])
                            tags = []
                            if isinstance(raw_tags, list):
                                for t in raw_tags:
                                    if isinstance(t, dict) and "tag" in t:
                                        tags.append(str(t["tag"]))
                                    elif isinstance(t, str):
                                        tags.append(t)

                            # Safe numeric conversions
                            def to_int(val, default=0):
                                try:
                                    return int(val)
                                except (ValueError, TypeError):
                                    return default

                            details = ModWorkshopDetails(
                                publishedfileid=file_id,
                                result=to_int(item.get("result", 1)),
                                title=str(item.get("title", "")).strip() or f"Mod {file_id}",
                                description=str(item.get("description", "")),
                                time_created=to_int(item.get("time_created", 0)),
                                time_updated=to_int(item.get("time_updated", 0)),
                                file_size=to_int(item.get("file_size", 0)),
                                preview_url=str(item.get("preview_url", "")),
                                subscriptions=to_int(item.get("subscriptions", 0)),
                                favorited=to_int(item.get("favorited", 0)),
                                views=to_int(item.get("views", 0)),
                                tags=tags,
                                banned=bool(to_int(item.get("banned", 0))),
                                creator_app_id=to_int(item.get("creator_app_id", 0)),
                                consumer_app_id=to_int(item.get("consumer_app_id", 0)),
                            )
                            results[file_id] = details
                except Exception as e:
                    print(f"[SteamAPI] Error querying batch {chunk[:3]}...: {e}")

        return results

    async def get_collection_items(self, collection_id: str) -> List[str]:
        """
        Retrieves all child Workshop item IDs from a collection.
        Tries Steam Web API first, then falls back to HTML scraping.
        """
        child_ids: List[str] = []

        # Try API
        api_url = f"{STEAM_API_BASE}/ISteamRemoteStorage/GetCollectionDetails/v1/"
        form_data = {
            "collectioncount": "1",
            "publishedfileids[0]": str(collection_id),
            "format": "json",
        }
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=self.timeout) as client:
                resp = await client.post(api_url, data=form_data)
                if resp.status_code == 200:
                    data = resp.json()
                    collections = (
                        data.get("response", {})
                        .get("collectiondetails", [])
                    )
                    if collections:
                        children = collections[0].get("children", [])
                        for child in children:
                            c_id = str(child.get("publishedfileid", "")).strip()
                            if c_id and c_id != collection_id and c_id not in child_ids:
                                child_ids.append(c_id)
        except Exception as e:
            print(f"[SteamAPI] Collection API error for {collection_id}: {e}")

        # If API returned items, return them
        if child_ids:
            return child_ids

        # Fallback: HTML Scraping
        web_url = f"https://steamcommunity.com/sharedfiles/filedetails/?id={collection_id}"
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=self.timeout, follow_redirects=True) as client:
                resp = await client.get(web_url)
                if resp.status_code == 200:
                    html = resp.text
                    # Look for child item links
                    pattern = r'href=["\']https?://steamcommunity\.com/sharedfiles/filedetails/\?id=(\d{7,12})["\']'
                    found = re.findall(pattern, html)
                    for item_id in found:
                        if item_id != collection_id and item_id not in child_ids:
                            child_ids.append(item_id)
        except Exception as e:
            print(f"[SteamAPI] Collection HTML scrape error for {collection_id}: {e}")

        return child_ids

    async def parse_input_text(self, text: str) -> Tuple[List[str], List[str]]:
        """
        Parses raw text (URLs, collection links, plain IDs, comma/newline separated).
        Returns tuple: (list_of_mod_ids, list_of_detected_collection_ids)
        """
        mod_ids: List[str] = []
        collection_ids: List[str] = []

        if not text:
            return [], []

        # Find all collection links
        # Examples:
        # https://steamcommunity.com/sharedfiles/filedetails/?id=123456
        # https://steamcommunity.com/workshop/filedetails/?id=123456
        collection_regex = r"(?:section=collections.*?id=(\d{7,12}))"
        found_collections = re.findall(collection_regex, text)
        for col_id in found_collections:
            if col_id not in collection_ids:
                collection_ids.append(col_id)

        # Standard item / general ID pattern
        # Matches ?id=123456789 or raw 7-12 digit numbers
        id_pattern = r"(?:id=(\d{7,12})|\b(\d{7,12})\b)"
        matches = re.findall(id_pattern, text)

        for m in matches:
            val = m[0] if m[0] else m[1]
            if not val:
                continue
            # If line had 'section=collections', it's a collection
            if val in collection_ids:
                continue
            if val not in mod_ids:
                mod_ids.append(val)

        # For any detected collection IDs, expand them
        for col_id in collection_ids:
            items = await self.get_collection_items(col_id)
            for item in items:
                if item not in mod_ids:
                    mod_ids.append(item)

        return mod_ids, collection_ids


# Global client instance
steam_api_client = SteamApiClient()
