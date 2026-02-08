from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, Any
from app.core.config import settings

class CRMRepository:
    def __init__(self, file_path: Path | None = None) -> None:
        self.file_path = file_path or settings.resolved_mock_crm_file()
        self._cache: Dict[str, Any] | None = None

    def _load(self) -> Dict[str, Any]:
        if self._cache is None:
            self._cache = json.loads(self.file_path.read_text(encoding="utf-8"))
        return self._cache

    def get_profile(self, customer_id: str) -> Dict[str, Any] | None:
        data = self._load()
        return data.get(customer_id)
