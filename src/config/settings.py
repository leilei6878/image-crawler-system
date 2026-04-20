import os
from dataclasses import dataclass


def _get_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None or raw_value == "":
        return default

    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc

    if value < 0:
        raise ValueError(f"{name} must be greater than or equal to 0")

    return value


@dataclass(frozen=True)
class Settings:
    app_env: str = "development"
    log_level: str = "info"
    crawl_timeout: int = 30
    crawl_retry_count: int = 3
    crawl_concurrency: int = 4
    data_dir: str = "./data"
    download_dir: str = "./data/downloads"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_env=os.getenv("APP_ENV", cls.app_env),
            log_level=os.getenv("LOG_LEVEL", cls.log_level),
            crawl_timeout=_get_int("CRAWL_TIMEOUT", cls.crawl_timeout),
            crawl_retry_count=_get_int("CRAWL_RETRY_COUNT", cls.crawl_retry_count),
            crawl_concurrency=_get_int("CRAWL_CONCURRENCY", cls.crawl_concurrency),
            data_dir=os.getenv("DATA_DIR", cls.data_dir),
            download_dir=os.getenv("DOWNLOAD_DIR", cls.download_dir),
        )
