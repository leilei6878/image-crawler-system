import pytest

from src.config import Settings


def test_settings_load_defaults(monkeypatch):
    for name in (
        "APP_ENV",
        "LOG_LEVEL",
        "CRAWL_TIMEOUT",
        "CRAWL_RETRY_COUNT",
        "CRAWL_CONCURRENCY",
        "CRAWL_USER_AGENT",
        "DATA_DIR",
        "DOWNLOAD_DIR",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = Settings.from_env()

    assert settings.app_env == "development"
    assert settings.log_level == "info"
    assert settings.crawl_timeout == 30
    assert settings.crawl_retry_count == 3
    assert settings.crawl_concurrency == 4
    assert settings.crawl_user_agent == "image-crawler-system/0.1"
    assert settings.data_dir == "./data"
    assert settings.download_dir == "./data/downloads"


def test_settings_load_environment_values(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOG_LEVEL", "debug")
    monkeypatch.setenv("CRAWL_TIMEOUT", "10")
    monkeypatch.setenv("CRAWL_RETRY_COUNT", "2")
    monkeypatch.setenv("CRAWL_CONCURRENCY", "1")
    monkeypatch.setenv("CRAWL_USER_AGENT", "test-agent/1.0")
    monkeypatch.setenv("DATA_DIR", "./tmp/data")
    monkeypatch.setenv("DOWNLOAD_DIR", "./tmp/downloads")

    settings = Settings.from_env()

    assert settings.app_env == "test"
    assert settings.log_level == "debug"
    assert settings.crawl_timeout == 10
    assert settings.crawl_retry_count == 2
    assert settings.crawl_concurrency == 1
    assert settings.crawl_user_agent == "test-agent/1.0"
    assert settings.data_dir == "./tmp/data"
    assert settings.download_dir == "./tmp/downloads"


def test_settings_reject_invalid_integer(monkeypatch):
    monkeypatch.setenv("CRAWL_TIMEOUT", "slow")

    with pytest.raises(ValueError, match="CRAWL_TIMEOUT must be an integer"):
        Settings.from_env()
