from __future__ import annotations
import os
from pathlib import Path

from pydantic import BaseModel

# Load .env so OPENAI_API_KEY is available without exporting (enables vision LLM + advisor LLM)
def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
        backend_dir = Path(__file__).resolve().parents[2]  # app/core -> backend
        # Prefer backend/.env (next to this app), then cwd
        for path in (backend_dir / ".env", Path.cwd() / ".env"):
            if path.is_file():
                load_dotenv(path, override=False)
                break
    except ImportError:
        pass


_load_dotenv()


def _get_openai_key() -> str | None:
    raw = os.environ.get("OPENAI_API_KEY")
    if not raw:
        return None
    key = (raw or "").strip()
    # Remove surrounding quotes if dotenv left them
    if len(key) >= 2 and key[0] == key[-1] and key[0] in ('"', "'"):
        key = key[1:-1].strip()
    return key if key and not key.startswith("#") else None


class Settings(BaseModel):
    app_name: str = "SmartHome Advisor API"
    # Optional: set OPENAI_API_KEY to use real LLM + multimodal layout analysis (vision)
    openai_api_key: str | None = _get_openai_key()
    api_prefix: str = "/api/v1"
    data_dir: Path = Path(__file__).resolve().parents[3] / "data"  # repo_root/data
    prompts_dir: Path = Path(__file__).resolve().parents[2] / "prompts"  # backend/prompts
    # Frontend (e.g. WaelAbouceo/e-smart-living-advisor); allow CORS from this origin
    cors_origins: list[str] = [
        "https://waelabouceo.github.io",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
    ]
    mock_crm_file: Path | None = None
    product_catalog_file: Path | None = None

    def resolved_mock_crm_file(self) -> Path:
        return self.mock_crm_file or (self.data_dir / "mock_crm_profiles.json")

    def resolved_product_catalog_file(self) -> Path:
        return self.product_catalog_file or (self.data_dir / "product_catalog.json")

settings = Settings()
