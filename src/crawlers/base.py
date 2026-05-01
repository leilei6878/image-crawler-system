import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from src.config import Settings


@dataclass(frozen=True)
class CrawlRequest:
    url: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CrawlResult:
    url: str
    success: bool
    images: list[Any] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class BaseCrawler(ABC):
    source_name = "base"

    def __init__(self, settings: Settings, logger: logging.Logger | None = None) -> None:
        self.settings = settings
        self.logger = logger or logging.getLogger(self.source_name)

    @abstractmethod
    def crawl(self, request: CrawlRequest) -> CrawlResult:
        """Crawl a source and return normalized image results."""

    def _log_start(self, request: CrawlRequest) -> None:
        self.logger.info(
            "starting crawl",
            extra={
                "source": self.source_name,
                "url": request.url,
                "timeout": self.settings.crawl_timeout,
                "retry_count": self.settings.crawl_retry_count,
            },
        )
