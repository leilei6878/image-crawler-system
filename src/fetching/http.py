from dataclasses import dataclass, field
from threading import BoundedSemaphore
from typing import Any

import requests

from src.config import Settings
from src.models import normalize_url


@dataclass(frozen=True)
class FetcherConfig:
    timeout_seconds: int = 30
    retry_count: int = 3
    max_concurrency: int = 4
    user_agent: str = "image-crawler-system/0.1"

    @classmethod
    def from_settings(cls, settings: Settings) -> "FetcherConfig":
        return cls(
            timeout_seconds=settings.crawl_timeout,
            retry_count=settings.crawl_retry_count,
            max_concurrency=max(1, settings.crawl_concurrency),
            user_agent=settings.crawl_user_agent,
        )


@dataclass(frozen=True)
class FetchResponse:
    url: str
    status_code: int
    content: bytes
    headers: dict[str, str] = field(default_factory=dict)

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")


@dataclass(frozen=True)
class FetchErrorDetails:
    url: str
    message: str
    status_code: int | None = None
    error_type: str = "fetch_error"
    attempts: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


class FetchError(Exception):
    def __init__(self, details: FetchErrorDetails) -> None:
        super().__init__(details.message)
        self.details = details


class HttpFetcher:
    def __init__(
        self,
        config: FetcherConfig,
        session: requests.Session | None = None,
    ) -> None:
        self.config = config
        self.session = session or requests.Session()
        self._semaphore = BoundedSemaphore(value=max(1, config.max_concurrency))

    @classmethod
    def from_settings(
        cls,
        settings: Settings,
        session: requests.Session | None = None,
    ) -> "HttpFetcher":
        return cls(FetcherConfig.from_settings(settings), session=session)

    def fetch(self, url: str) -> FetchResponse:
        normalized_url = normalize_url(url)
        if normalized_url is None:
            raise FetchError(
                FetchErrorDetails(
                    url=url,
                    message=f"Invalid URL: {url}",
                    error_type="invalid_url",
                )
            )

        attempts = max(1, self.config.retry_count + 1)
        last_error: FetchErrorDetails | None = None

        with self._semaphore:
            for attempt in range(1, attempts + 1):
                try:
                    response = self.session.get(
                        normalized_url,
                        timeout=self.config.timeout_seconds,
                        headers={"User-Agent": self.config.user_agent},
                    )
                except requests.Timeout as exc:
                    last_error = FetchErrorDetails(
                        url=normalized_url,
                        message=f"Request timed out: {exc}",
                        error_type="timeout",
                        attempts=attempt,
                    )
                    continue
                except requests.RequestException as exc:
                    last_error = FetchErrorDetails(
                        url=normalized_url,
                        message=f"Request failed: {exc}",
                        error_type="network_error",
                        attempts=attempt,
                    )
                    continue

                if 200 <= response.status_code < 300:
                    return FetchResponse(
                        url=normalized_url,
                        status_code=response.status_code,
                        content=response.content,
                        headers=dict(response.headers),
                    )

                last_error = FetchErrorDetails(
                    url=normalized_url,
                    message=f"Unexpected HTTP status: {response.status_code}",
                    status_code=response.status_code,
                    error_type="http_status",
                    attempts=attempt,
                )
                if response.status_code not in {429, 500, 502, 503, 504}:
                    break

        assert last_error is not None
        raise FetchError(last_error)

    def fetch_text(self, url: str) -> str:
        return self.fetch(url).text
