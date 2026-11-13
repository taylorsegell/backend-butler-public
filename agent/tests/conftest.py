"""Settings are read at import, so the environment is set before tests import src/."""

import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("TEXT_API_TOKEN", "service-token")
os.environ.setdefault("TEXT_DATA_DIR", tempfile.mkdtemp())
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
