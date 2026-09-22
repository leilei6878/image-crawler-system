import requests
import pytest

from src.config import Settings
from src.fetching.http import FetcherConfig, FetchError, HttpFetcher


class FakeResponse:
    def __init__(self, status_code=200, content=b"ok", headers=None):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, timeout, headers):
        self.calls.append({"url": url, "timeout": timeout, "headers": headers})
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def test_fetcher_config_loads_from_settings():
    settings = Settings(
        crawl_timeout=7,
        crawl_retry_count=2,
        crawl_concurrency=3,
        crawl_user_agent="unit-test-agent",
    )

    config = FetcherConfig.from_settings(settings)

    assert config.timeout_seconds == 7
    assert config.retry_count == 2
    assert config.max_concurrency == 3
    assert config.user_agent == "unit-test-agent"


def test_fetcher_sends_timeout_and_user_agent():
    session = FakeSession([FakeResponse(content=b"<html></html>")])
    fetcher = HttpFetcher(
        FetcherConfig(timeout_seconds=5, retry_count=0, user_agent="test-agent"),
        session=session,
    )

    response = fetcher.fetch("HTTPS://Example.com/page#section")

    assert response.url == "https://example.com/page"
    assert response.text == "<html></html>"
    assert session.calls == [
        {
            "url": "https://example.com/page",
            "timeout": 5,
            "headers": {"User-Agent": "test-agent"},
        }
    ]


def test_fetcher_retries_timeout_then_succeeds():
    session = FakeSession([
        requests.Timeout("slow"),
        FakeResponse(content=b"ok"),
    ])
    fetcher = HttpFetcher(FetcherConfig(retry_count=1), session=session)

    response = fetcher.fetch("https://example.com/")

    assert response.content == b"ok"
    assert len(session.calls) == 2


def test_fetcher_raises_structured_error_for_non_2xx():
    session = FakeSession([FakeResponse(status_code=404, content=b"missing")])
    fetcher = HttpFetcher(FetcherConfig(retry_count=3), session=session)

    with pytest.raises(FetchError) as exc:
        fetcher.fetch("https://example.com/missing")

    assert exc.value.details.status_code == 404
    assert exc.value.details.error_type == "http_status"
    assert exc.value.details.attempts == 1


def test_fetcher_rejects_invalid_urls_before_request():
    session = FakeSession([])
    fetcher = HttpFetcher(FetcherConfig(), session=session)

    with pytest.raises(FetchError) as exc:
        fetcher.fetch("javascript:alert(1)")

    assert exc.value.details.error_type == "invalid_url"
    assert session.calls == []
