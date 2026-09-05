"""
Local mod scanner and update detector.
Parses RimWorld About.xml, PublishedFileId.txt, and checks Steam Web API for updates.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional
import os
import re
import xml.etree.ElementTree as ET
from pydantic import BaseModel, Field

from src.core.config import config_manager
from src.core.metadata_cache import metadata_cache
from src.core.steam_api import steam_api_client, ModWorkshopDetails


class InstalledMod(BaseModel):
    mod_id: str
    folder_name: str
    folder_path: str
    name: str = ""
    author: str = ""
    package_id: str = ""
    description: str = ""
    preview_image_path: Optional[str] = None
    preview_url: Optional[str] = None
    local_updated_time: int = 0
    remote_updated_time: int = 0
    update_available: bool = False
    is_non_steam: bool = False
    size_bytes: int = 0
    tags: List[str] = Field(default_factory=list)


def get_dir_size(path: Path) -> int:
    """Calculate total size of directory in bytes."""
    total = 0
    try:
        for entry in os.scandir(path):
            if entry.is_file(follow_symlinks=False):
                total += entry.stat().st_size
            elif entry.is_dir(follow_symlinks=False):
                total += get_dir_size(Path(entry.path))
    except Exception:
        pass
    return total


def parse_about_xml(about_xml_path: Path) -> Dict[str, Any]:
    """Extract metadata from About/About.xml."""
    result: Dict[str, Any] = {
        "name": "",
        "author": "",
        "packageId": "",
        "url": "",
        "description": "",
        "supported_versions": [],
    }
    if not about_xml_path.is_file():
        return result

    try:
        tree = ET.parse(about_xml_path)
        root = tree.getroot()
        for tag in ("name", "author", "packageId", "url", "description"):
            elem = root.find(tag)
            if elem is not None and elem.text:
                result[tag] = elem.text.strip()

        sup_elem = root.find("supportedVersions")
        if sup_elem is not None:
            versions = []
            for li in sup_elem.findall("li"):
                if li.text and li.text.strip():
                    versions.append(li.text.strip())
            result["supported_versions"] = versions
    except Exception as e:
        # Some mods have malformed XML; try simple regex fallback
        try:
            content = about_xml_path.read_text(encoding="utf-8", errors="ignore")
            for tag in ("name", "author", "packageId", "url", "description"):
                m = re.search(rf"<{tag}>(.*?)</{tag}>", content, re.DOTALL | re.IGNORECASE)
                if m:
                    result[tag] = m.group(1).strip()

            m_sup = re.search(r"<supportedVersions>(.*?)</supportedVersions>", content, re.DOTALL | re.IGNORECASE)
            if m_sup:
                lis = re.findall(r"<li>(.*?)</li>", m_sup.group(1), re.DOTALL | re.IGNORECASE)
                result["supported_versions"] = [v.strip() for v in lis if v.strip()]
        except Exception:
            pass

    return result


def get_local_mod_timestamp(mod_folder: Path) -> int:
    """
    Get the timestamp of when the mod was last updated.
    Checks About/.lastupdated first, then PublishedFileId.txt or directory mtime.
    """
    about_dir = mod_folder / "About"
    lastupdated_file = about_dir / ".lastupdated"

    if lastupdated_file.is_file():
        try:
            content = lastupdated_file.read_text(encoding="utf-8").strip()
            ts = int(content)
            if ts > 0:
                return ts
        except Exception:
            pass

    # Fallback to PublishedFileId.txt mtime
    id_file = about_dir / "PublishedFileId.txt"
    if id_file.is_file():
        try:
            return int(id_file.stat().st_mtime)
        except Exception:
            pass

    # Final fallback to folder mtime
    try:
        return int(mod_folder.stat().st_mtime)
    except Exception:
        return 0


def find_preview_image(mod_folder: Path) -> Optional[str]:
    """Finds preview image in About folder or mod root folder."""
    preview_names = (
        "preview.png",
        "Preview.png",
        "preview.jpg",
        "Preview.jpg",
        "preview.jpeg",
        "Preview.jpeg",
        "Preview.webp",
        "ModIcon.png",
        "modicon.png",
        "modIcon.png",
    )
    about_dir = mod_folder / "About"
    if about_dir.is_dir():
        for name in preview_names:
            candidate = about_dir / name
            if candidate.is_file():
                return str(candidate.resolve())

    for name in preview_names:
        candidate = mod_folder / name
        if candidate.is_file():
            return str(candidate.resolve())

    return None


class ModScanner:
    """Scans local mods directory and detects updates."""

    async def scan_installed_mods(
        self, custom_path: Optional[Path] = None, check_online: bool = True
    ) -> List[InstalledMod]:
        mods_dir = custom_path or config_manager.settings.get_resolved_download_path()
        if not mods_dir.is_dir():
            return []

        installed_mods: List[InstalledMod] = []
        workshop_ids_to_query: List[str] = []
        uncached_ids: List[str] = []

        # Iterate subdirectories
        for entry in os.scandir(mods_dir):
            if not entry.is_dir():
                continue

            mod_folder = Path(entry.path)
            about_dir = mod_folder / "About"

            # Check for PublishedFileId.txt
            published_file_id = ""
            is_non_steam = True
            id_file = about_dir / "PublishedFileId.txt"

            if id_file.is_file():
                try:
                    raw_id = id_file.read_text(encoding="utf-8").strip()
                    if raw_id.isdigit() and len(raw_id) >= 7:
                        published_file_id = raw_id
                        is_non_steam = False
                except Exception:
                    pass

            # If no ID file, but folder name is a numeric ID, use that
            if not published_file_id and mod_folder.name.isdigit() and len(mod_folder.name) >= 7:
                published_file_id = mod_folder.name
                is_non_steam = False

            # If still no ID, use folder name as identifier
            effective_id = published_file_id or mod_folder.name

            # Parse About.xml if available
            about_xml = about_dir / "About.xml"
            metadata = parse_about_xml(about_xml)

            title = metadata.get("name") or mod_folder.name
            author = metadata.get("author") or ""
            package_id = metadata.get("packageId") or ""
            description = metadata.get("description") or ""

            preview_img = find_preview_image(mod_folder)
            local_ts = get_local_mod_timestamp(mod_folder)
            size_bytes = get_dir_size(mod_folder)

            mod = InstalledMod(
                mod_id=effective_id,
                folder_name=mod_folder.name,
                folder_path=str(mod_folder.resolve()),
                name=title,
                author=author,
                package_id=package_id,
                description=description,
                preview_image_path=preview_img,
                local_updated_time=local_ts,
                is_non_steam=is_non_steam,
                size_bytes=size_bytes,
            )

            # If about_xml has supported_versions, add them to mod.tags
            for v in metadata.get("supported_versions", []):
                if v and v not in mod.tags:
                    mod.tags.append(v)

            # Check metadata_cache.get(mod.mod_id)
            cached = metadata_cache.get(mod.mod_id)
            if cached:
                if not mod.preview_url and cached.get("preview_url"):
                    mod.preview_url = cached.get("preview_url")
                for t in cached.get("tags", []):
                    if t and t not in mod.tags:
                        mod.tags.append(t)
                cached_ts = cached.get("time_updated", 0)
                if cached_ts:
                    mod.remote_updated_time = cached_ts
                cached_title = cached.get("title")
                if cached_title and not cached_title.startswith(f"Mod {mod.mod_id}"):
                    if not mod.name or mod.name == mod.folder_name:
                        mod.name = cached_title
            else:
                if not is_non_steam and published_file_id:
                    uncached_ids.append(published_file_id)

            installed_mods.append(mod)

            if not is_non_steam and published_file_id:
                workshop_ids_to_query.append(published_file_id)

        # Batch query Steam API for remote metadata & update check
        if check_online and workshop_ids_to_query:
            remote_details = await steam_api_client.get_published_file_details(
                workshop_ids_to_query
            )

            cache_to_set = {}
            for mod in installed_mods:
                if mod.mod_id in remote_details:
                    details: ModWorkshopDetails = remote_details[mod.mod_id]

                    valid_title = details.title if (details.result == 1 and details.title and not details.title.startswith(f"Mod {mod.mod_id}")) else (mod.name or details.title)
                    if valid_title and (not mod.name or mod.name == mod.folder_name):
                        mod.name = valid_title

                    if details.preview_url:
                        mod.preview_url = details.preview_url

                    if details.time_updated > 0:
                        mod.remote_updated_time = details.time_updated

                    for t in details.tags:
                        if t and t not in mod.tags:
                            mod.tags.append(t)

                    # Check if update is available
                    # Allow 60 second margin for minor timestamp rounding
                    if (
                        details.time_updated > 0
                        and mod.local_updated_time > 0
                        and details.time_updated > (mod.local_updated_time + 60)
                    ):
                        mod.update_available = True

                    cache_to_set[mod.mod_id] = {
                        "title": valid_title or mod.name,
                        "preview_url": mod.preview_url or "",
                        "tags": mod.tags,
                        "time_updated": mod.remote_updated_time,
                    }

            if cache_to_set:
                metadata_cache.batch_set(cache_to_set)

        elif not check_online and uncached_ids:
            # Query uncached IDs to populate cache permanently even when check_online=False
            remote_details = await steam_api_client.get_published_file_details(
                uncached_ids
            )
            cache_to_set = {}
            for mod in installed_mods:
                if mod.mod_id in remote_details:
                    details = remote_details[mod.mod_id]

                    valid_title = details.title if (details.result == 1 and details.title and not details.title.startswith(f"Mod {mod.mod_id}")) else (mod.name or details.title)
                    if valid_title and (not mod.name or mod.name == mod.folder_name):
                        mod.name = valid_title

                    if details.preview_url and not mod.preview_url:
                        mod.preview_url = details.preview_url

                    if details.time_updated > 0:
                        mod.remote_updated_time = details.time_updated

                    for t in details.tags:
                        if t and t not in mod.tags:
                            mod.tags.append(t)

                    cache_to_set[mod.mod_id] = {
                        "title": valid_title or mod.name,
                        "preview_url": mod.preview_url or "",
                        "tags": mod.tags,
                        "time_updated": mod.remote_updated_time,
                    }

            if cache_to_set:
                metadata_cache.batch_set(cache_to_set)

        return installed_mods


mod_scanner = ModScanner()
