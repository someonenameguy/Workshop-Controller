"""
Mod refactoring and adoption engine.
Scans loose/untracked mod folders, discovers Workshop IDs, heals missing PublishedFileId.txt,
and standardizes structure so they seamlessly receive automatic updates.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional
import os
import re
import shutil
from pydantic import BaseModel

from src.core.mod_scanner import parse_about_xml, find_preview_image
from src.core.steam_api import steam_api_client, ModWorkshopDetails


class RefactorCandidate(BaseModel):
    folder_path: str
    folder_name: str
    detected_mod_id: Optional[str] = None
    title: str = ""
    author: str = ""
    package_id: str = ""
    has_published_file_id: bool = False
    has_last_updated: bool = False
    folder_name_matches: bool = False
    proposed_folder_name: str = ""
    can_refactor: bool = False
    needs_refactor: bool = True
    status_message: str = ""


def sanitize_filename(name: str) -> str:
    """Sanitize folder name for all platforms."""
    # Strip invalid characters
    sanitized = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name)
    sanitized = re.sub(r"\s+", " ", sanitized).strip(" .")
    if not sanitized:
        return "Mod"
    return sanitized[:120]


class ModRefactorer:
    """Scans and refactors third-party / loose mods to integrate with the downloader."""

    @staticmethod
    def _evaluate_candidate_status(c: RefactorCandidate) -> None:
        """
        Determines whether a candidate needs refactoring and if it can be refactored.
        A mod needs refactoring if:
        - Missing PublishedFileId.txt
        - Folder name does not match proposed folder name
        - Missing .lastupdated timestamp file
        """
        c.folder_name_matches = bool(c.proposed_folder_name and c.folder_name == c.proposed_folder_name)
        c.needs_refactor = (
            (not c.has_published_file_id)
            or (not c.folder_name_matches)
            or (not c.has_last_updated)
        )

        # If a mod has PublishedFileId.txt but folder name is mismatched,
        # can_refactor MUST be True and needs_refactor MUST be True.
        if c.has_published_file_id and not c.folder_name_matches:
            c.can_refactor = True
            c.needs_refactor = True
        elif c.needs_refactor:
            # Mod can be refactored if we have a detected mod id OR a proposed folder name to rename
            if c.detected_mod_id or (c.proposed_folder_name and not c.folder_name_matches):
                c.can_refactor = True
            else:
                c.can_refactor = False
        else:
            c.can_refactor = False

    async def scan_folder_for_refactor(self, target_dir: Path) -> List[RefactorCandidate]:
        """Scans a directory for mods that can be refactored/adopted."""
        if not target_dir.is_dir():
            return []

        candidates: List[RefactorCandidate] = []
        ids_to_verify: List[str] = []
        candidate_map: Dict[str, List[RefactorCandidate]] = {}

        for entry in os.scandir(target_dir):
            if not entry.is_dir():
                continue
            if entry.name.startswith("."):
                continue

            folder = Path(entry.path)
            about_dir = folder / "About"
            id_file = about_dir / "PublishedFileId.txt"
            last_updated_file = about_dir / ".lastupdated"
            about_xml = about_dir / "About.xml"

            has_id_file = False
            has_last_updated = False
            detected_id: Optional[str] = None

            # 1. Check existing PublishedFileId.txt
            if id_file.is_file():
                try:
                    content = id_file.read_text(encoding="utf-8").strip()
                    if content.isdigit() and len(content) >= 7:
                        detected_id = content
                        has_id_file = True
                except Exception:
                    pass

            # Check existing .lastupdated
            if last_updated_file.is_file():
                try:
                    c_time = last_updated_file.read_text(encoding="utf-8").strip()
                    if c_time:
                        has_last_updated = True
                except Exception:
                    pass

            # 2. Check folder name for ID (e.g. 2009463077 or ModName_2009463077)
            if not detected_id:
                folder_m = re.search(r"\b(\d{7,12})\b", folder.name)
                if folder_m:
                    detected_id = folder_m.group(1)

            # 3. Check About.xml for Steam Workshop URLs
            about_meta = parse_about_xml(about_xml) if about_xml.is_file() else {}
            about_name = (about_meta.get("name") or "").strip()
            title = about_name if about_name else folder.name
            author = about_meta.get("author") or ""
            pkg_id = about_meta.get("packageId") or ""
            url = about_meta.get("url") or ""

            if not detected_id and url:
                url_m = re.search(r"[?&]id=(\d{7,12})", url)
                if url_m:
                    detected_id = url_m.group(1)

            # 4. Check description for Steam Workshop URLs
            if not detected_id and about_meta.get("description"):
                desc_m = re.search(r"steamcommunity\.com/sharedfiles/filedetails/\?id=(\d{7,12})", about_meta["description"])
                if desc_m:
                    detected_id = desc_m.group(1)

            # 5. Check Manifest.xml if present
            manifest_xml = about_dir / "Manifest.xml"
            if not detected_id and manifest_xml.is_file():
                try:
                    m_content = manifest_xml.read_text(encoding="utf-8", errors="ignore")
                    m_m = re.search(r"[?&]id=(\d{7,12})", m_content)
                    if m_m:
                        detected_id = m_m.group(1)
                except Exception:
                    pass

            sanitized_title = sanitize_filename(title)
            proposed_name = sanitized_title

            candidate = RefactorCandidate(
                folder_path=str(folder.resolve()),
                folder_name=folder.name,
                detected_mod_id=detected_id,
                title=title,
                author=author,
                package_id=pkg_id,
                has_published_file_id=has_id_file,
                has_last_updated=has_last_updated,
                folder_name_matches=(folder.name == proposed_name),
                proposed_folder_name=proposed_name,
                can_refactor=False,
                needs_refactor=True,
                status_message="Checking Workshop ID..." if detected_id else "No Workshop ID detected",
            )
            self._evaluate_candidate_status(candidate)

            # Set descriptive initial status message
            if candidate.has_published_file_id:
                if not candidate.folder_name_matches:
                    candidate.status_message = f"Has PublishedFileId ({candidate.detected_mod_id}). Folder needs renaming to '{candidate.proposed_folder_name}'."
                elif not candidate.has_last_updated:
                    candidate.status_message = f"Has PublishedFileId ({candidate.detected_mod_id}). Missing .lastupdated timestamp."
                else:
                    candidate.status_message = f"Healthy: '{candidate.title}'."
            elif candidate.detected_mod_id:
                candidate.status_message = f"Detected Workshop ID {candidate.detected_mod_id}. Checking Steam..."
            elif candidate.proposed_folder_name and not candidate.folder_name_matches:
                candidate.status_message = f"Local mod '{candidate.title}'. Ready to rename folder to '{candidate.proposed_folder_name}'."
            else:
                candidate.status_message = "No Workshop ID or mod metadata detected."

            candidates.append(candidate)

            if detected_id:
                ids_to_verify.append(detected_id)
                candidate_map.setdefault(detected_id, []).append(candidate)

        # Verify detected IDs via Steam Web API
        if ids_to_verify:
            try:
                verified_details = await steam_api_client.get_published_file_details(ids_to_verify)
            except Exception as e:
                print(f"[Refactor] Steam API verification error: {e}")
                verified_details = {}

            for m_id, items in candidate_map.items():
                details = verified_details.get(m_id)
                if details and details.result == 1:
                    for item in items:
                        if details.title and not details.title.startswith("Mod "):
                            item.title = details.title
                            item.proposed_folder_name = sanitize_filename(details.title)
                        self._evaluate_candidate_status(item)

                        if not item.needs_refactor:
                            item.status_message = f"Healthy: '{item.title}' (ID {m_id}). Up-to-date and correctly named."
                        elif not item.has_published_file_id:
                            item.status_message = f"Verified: '{item.title}' (ID {m_id}). Ready to adopt & rename to '{item.proposed_folder_name}'."
                        elif not item.folder_name_matches:
                            item.status_message = f"Verified: '{item.title}' (ID {m_id}). Ready to rename folder from '{item.folder_name}' to '{item.proposed_folder_name}'."
                        elif not item.has_last_updated:
                            item.status_message = f"Verified: '{item.title}' (ID {m_id}). Ready to generate .lastupdated timestamp."
                else:
                    for item in items:
                        if item.detected_mod_id and item.title:
                            item.can_refactor = True
                            item.proposed_folder_name = sanitize_filename(item.title)
                            item.folder_name_matches = bool(item.proposed_folder_name and item.folder_name == item.proposed_folder_name)
                            if (item.folder_name != item.proposed_folder_name) or (not item.has_published_file_id) or (not item.has_last_updated):
                                item.needs_refactor = True
                                if item.folder_name != item.proposed_folder_name:
                                    item.status_message = f"Workshop ID: {item.detected_mod_id}. Ready to rename to '{item.title}'."
                                elif not item.has_published_file_id:
                                    item.status_message = f"Workshop ID: {item.detected_mod_id}. Ready to adopt & add PublishedFileId.txt for '{item.title}'."
                                else:
                                    item.status_message = f"Workshop ID: {item.detected_mod_id}. Ready to generate .lastupdated timestamp for '{item.title}'."
                            else:
                                item.needs_refactor = False
                                item.can_refactor = False
                                item.status_message = f"Healthy: '{item.title}' (ID {item.detected_mod_id})."
                        else:
                            self._evaluate_candidate_status(item)
                            if item.has_published_file_id and not item.folder_name_matches:
                                item.can_refactor = True
                                item.needs_refactor = True
                                item.status_message = f"Has PublishedFileId ({m_id}). Ready to rename folder to '{item.proposed_folder_name}'."
                            elif item.needs_refactor and item.can_refactor:
                                item.status_message = f"ID {m_id} unverified on Steam, but ready to rename folder to '{item.proposed_folder_name}'."
                            else:
                                item.status_message = f"ID {m_id} not found on Steam Workshop."

        return candidates

    async def execute_refactor(
        self,
        folder_path: str,
        mod_id: Optional[str] = None,
        rename_folder: bool = True,
        force_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes refactoring for a single mod:
        1. Ensures About/PublishedFileId.txt exists and contains mod_id (if provided or discovered).
        2. Queries Steam API to write About/.lastupdated with remote timestamp (if mod_id available).
        3. Always renames folder to sanitized title (from Steam API or About.xml) when rename_folder=True,
           handling case-sensitivity and folder collisions.
        """
        folder = Path(folder_path).resolve()
        if not folder.is_dir():
            raise FileNotFoundError(f"Directory {folder} does not exist.")

        about_dir = folder / "About"
        about_dir.mkdir(parents=True, exist_ok=True)
        about_xml = about_dir / "About.xml"
        id_file = about_dir / "PublishedFileId.txt"

        clean_mod_id = str(mod_id).strip() if mod_id is not None and str(mod_id).strip() else None

        # If mod_id was not passed, check existing PublishedFileId.txt
        if not clean_mod_id and id_file.is_file():
            try:
                content = id_file.read_text(encoding="utf-8").strip()
                if content.isdigit() and len(content) >= 7:
                    clean_mod_id = content
            except Exception:
                pass

        # Check folder name for ID if still not found
        if not clean_mod_id:
            folder_m = re.search(r"\b(\d{7,12})\b", folder.name)
            if folder_m:
                clean_mod_id = folder_m.group(1)

        # Also check About.xml for Workshop ID if still not found
        about_meta = parse_about_xml(about_xml) if about_xml.is_file() else {}
        if not clean_mod_id and about_meta:
            url = about_meta.get("url") or ""
            url_m = re.search(r"[?&]id=(\d{7,12})", url)
            if url_m:
                clean_mod_id = url_m.group(1)
            elif about_meta.get("description"):
                desc_m = re.search(r"steamcommunity\.com/sharedfiles/filedetails/\?id=(\d{7,12})", about_meta["description"])
                if desc_m:
                    clean_mod_id = desc_m.group(1)

        # 1. Write PublishedFileId.txt if mod_id is available
        if clean_mod_id:
            id_file.write_text(clean_mod_id, encoding="utf-8")

        # 2. Determine title and fetch remote update timestamp & write .lastupdated
        title_to_use = force_title.strip() if force_title and force_title.strip() else None
        about_name = about_meta.get("name", "").strip() if about_meta else ""

        if clean_mod_id:
            try:
                remote_details = await steam_api_client.get_published_file_details([clean_mod_id])
                if clean_mod_id in remote_details:
                    details = remote_details[clean_mod_id]
                    if details.result == 1:
                        if details.time_updated > 0:
                            last_updated_file = about_dir / ".lastupdated"
                            last_updated_file.write_text(str(details.time_updated), encoding="utf-8")
                        if details.title and not details.title.startswith("Mod ") and not title_to_use:
                            title_to_use = details.title
            except Exception as e:
                print(f"[Refactor] Warning: could not fetch remote details for {clean_mod_id}: {e}")

        # If Steam API details has result != 1 or no title, use force_title or parse <name> from folder / "About" / "About.xml"!
        if not title_to_use:
            if about_name:
                title_to_use = about_name
            else:
                title_to_use = folder.name

        final_folder_path = folder

        # 3. Rename folder to sanitized mod title/name
        if rename_folder:
            sanitized = sanitize_filename(title_to_use)
            parent_dir = folder.parent
            target_path = parent_dir / sanitized

            def is_same_dir(p1: Path, p2: Path) -> bool:
                if not p1.exists() or not p2.exists():
                    return False
                try:
                    return p1.samefile(p2)
                except Exception:
                    return p1.resolve() == p2.resolve()

            if target_path.name != folder.name:
                if target_path.exists():
                    if is_same_dir(folder, target_path):
                        # Case-only rename (e.g. harmony -> Harmony on case-insensitive OS)
                        temp_path = parent_dir / f"{folder.name}__temp_rename_{os.getpid()}_{id(folder)}"
                        shutil.move(str(folder), str(temp_path))
                        shutil.move(str(temp_path), str(target_path))
                        final_folder_path = target_path
                    else:
                        # Target folder exists and is a different folder: rename to Mod Title (ID)
                        id_suffix = f" ({clean_mod_id})" if clean_mod_id else ""
                        target_path = parent_dir / f"{sanitized}{id_suffix}"

                        counter = 1
                        while target_path.exists() and not is_same_dir(folder, target_path):
                            target_path = parent_dir / f"{sanitized}{id_suffix} ({counter})"
                            counter += 1

                        if target_path.exists() and is_same_dir(folder, target_path):
                            temp_path = parent_dir / f"{folder.name}__temp_rename_{os.getpid()}_{id(folder)}"
                            shutil.move(str(folder), str(temp_path))
                            shutil.move(str(temp_path), str(target_path))
                        else:
                            shutil.move(str(folder), str(target_path))
                        final_folder_path = target_path
                else:
                    shutil.move(str(folder), str(target_path))
                    final_folder_path = target_path

        # Ensure PublishedFileId.txt is written with mod_id in final destination folder
        if clean_mod_id:
            final_about_dir = final_folder_path / "About"
            final_about_dir.mkdir(parents=True, exist_ok=True)
            (final_about_dir / "PublishedFileId.txt").write_text(clean_mod_id, encoding="utf-8")

        return {
            "status": "success",
            "mod_id": clean_mod_id,
            "title": title_to_use,
            "original_path": str(folder),
            "new_path": str(final_folder_path),
            "folder_name": final_folder_path.name,
        }


mod_refactorer = ModRefactorer()
