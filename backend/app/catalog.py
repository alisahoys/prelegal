import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


VARIABLE_SPAN = re.compile(
    r'<span class="(?:keyterms_link|businessterms_link|coverpage_link|orderform_link|sow_link)"(?: id="[A-Za-z0-9._-]+")?>([^<]*)</span>'
)


class CatalogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    editor: Literal["nda", "markdown"]
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=1000)
    filename: str = Field(min_length=1, max_length=500)


def template_fields(filename: str, catalog_path: Path | None = None) -> list[str]:
    base = catalog_path or Path(os.environ.get("PRELEGAL_CATALOG_PATH", Path(__file__).resolve().parents[2] / "catalog.json"))
    path = base.parent / filename
    fields: list[str] = []
    for match in VARIABLE_SPAN.finditer(path.read_text(encoding="utf-8")):
        label = re.sub(r"\s+", " ", match.group(1).replace("‎", "").strip())
        if label and label not in fields:
            fields.append(label)
    return fields


@lru_cache(maxsize=1)
def catalog_by_id() -> dict[str, CatalogEntry]:
    catalog_path = Path(os.environ.get("PRELEGAL_CATALOG_PATH", Path(__file__).resolve().parents[2] / "catalog.json"))
    entries = [CatalogEntry.model_validate(entry) for entry in json.loads(catalog_path.read_text(encoding="utf-8"))]
    if len({entry.id for entry in entries}) != len(entries):
        raise ValueError("Catalog IDs must be unique.")
    if len({entry.filename for entry in entries}) != len(entries):
        raise ValueError("Catalog filenames must be unique.")
    if any(not re.fullmatch(r"templates/[A-Za-z0-9._-]+\.md", entry.filename) for entry in entries):
        raise ValueError("Catalog filenames must identify a template Markdown file.")
    return {entry.id: entry for entry in entries}
