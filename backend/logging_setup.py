"""Application logging: a rotating file beside the database plus stderr.

The packaged desktop app runs without a terminal, so a rotating log file in
the data directory is the only way to diagnose problems after the fact. The
same records also go to stderr for development.
"""

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_MAX_BYTES = 1_000_000
LOG_BACKUP_COUNT = 3

_logger = logging.getLogger("canvenient")


def log_dir_from_url(database_url: str) -> Path | None:
    """Derive the data directory from a sqlite DATABASE_URL, like backup.py."""
    if "sqlite" not in database_url.lower():
        return None
    db_path = database_url.split("///", 1)[-1]
    return Path(db_path).parent if db_path else None


def setup_logging(database_url: str | None = None) -> Path | None:
    """Attach a rotating file handler (and keep stderr output). Idempotent.

    Returns the log file path, or None when there is no SQLite data directory.
    """
    url = database_url if database_url is not None else (os.getenv("DATABASE_URL") or "")
    log_dir = log_dir_from_url(url)

    _logger.setLevel(LOG_LEVEL)
    _logger.propagate = False

    handlers: list[logging.Handler] = []
    if log_dir is not None:
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / "canvenient.log"
            file_handler = RotatingFileHandler(
                log_file, maxBytes=LOG_MAX_BYTES, backupCount=LOG_BACKUP_COUNT, encoding="utf-8"
            )
            handlers.append(file_handler)
        except OSError:
            log_file = None
    else:
        log_file = None

    stderr_handler = logging.StreamHandler()
    handlers.append(stderr_handler)

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    _logger.handlers.clear()
    for handler in handlers:
        handler.setFormatter(formatter)
        _logger.addHandler(handler)

    return log_file


def get_logger(name: str = "canvenient") -> logging.Logger:
    return logging.getLogger(name)
