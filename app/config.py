"""Runtime settings, all overridable by environment variables."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    project: str = os.getenv("GOOGLE_CLOUD_PROJECT", "bukti-ai")
    # Newest text/vision models are served from the global endpoint; Live is regional only.
    location: str = os.getenv("BUKTI_LOCATION", "global")
    live_location: str = os.getenv("BUKTI_LIVE_LOCATION", "us-central1")

    model_extract: str = os.getenv("BUKTI_MODEL_EXTRACT", "gemini-3.8-flash")
    model_memo: str = os.getenv("BUKTI_MODEL_MEMO", "gemini-4-argon")
    model_live: str = os.getenv("BUKTI_MODEL_LIVE", "gemini-3.8-live")
    model_tts: str = os.getenv("BUKTI_MODEL_TTS", "gemini-3.8-flash-tts")

    bucket: str = os.getenv("BUKTI_BUCKET", "")
    use_firestore: bool = os.getenv("BUKTI_FIRESTORE", "0") == "1"
    bq_dataset: str = os.getenv("BUKTI_BQ_DATASET", "bukti")
    use_bigquery: bool = os.getenv("BUKTI_BIGQUERY", "0") == "1"

    warm_models: bool = os.getenv("BUKTI_WARM", "1") == "1"

    # Loan officers for real applications (comma-separated Google emails); everyone else signed in is a borrower.
    officer_emails: frozenset[str] = frozenset(
        e.strip().lower() for e in os.getenv("BUKTI_OFFICER_EMAILS", "").split(",") if e.strip())
    # Key for short-lived signed image links on real applications; a random per-process key is used if unset.
    url_key: str = os.getenv("BUKTI_URL_KEY", "")

    data_dir: Path = ROOT / "data"
    web_dist: Path = ROOT / "web" / "dist"
    cache_dir: Path = Path(os.getenv("BUKTI_CACHE_DIR", os.path.join(tempfile.gettempdir(), "bukti")))


settings = Settings()
