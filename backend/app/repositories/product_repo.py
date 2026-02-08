from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, Any
from app.core.config import settings

class ProductRepository:
    def __init__(self, file_path: Path | None = None) -> None:
        self.file_path = file_path or settings.resolved_product_catalog_file()
        self._cache: Dict[str, Any] | None = None

    def _load(self) -> Dict[str, Any]:
        if self._cache is None:
            self._cache = json.loads(self.file_path.read_text(encoding="utf-8"))
        return self._cache

    def get_catalog(self) -> Dict[str, Any]:
        return self._load()

    def get_product_map(self) -> Dict[str, Any]:
        cat = self._load()
        return {p["product_id"]: p for p in cat.get("products", [])}
