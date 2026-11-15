"""Where the app keeps its local data: the SQLite database and the .env file with the API key."""

import os
from pathlib import Path

# Defaults to backend/ (next to app/) for a local start. Docker sets DATA_DIR to a mounted
# folder, so the data survives when the container is recreated.
DATA_DIR = Path(os.environ.get("DATA_DIR") or Path(__file__).resolve().parent.parent)
DATA_DIR.mkdir(parents=True, exist_ok=True)
