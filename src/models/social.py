from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from src.models.assets import utc_now
from src.models.url_utils import normalize_url

Platform = Literal[
    "xiaohongshu",
    "weibo",
    "instagram",
    "pinterest",
    "tiktok",
    "website",
    "other",
]
CrawlMode = Literal["historical", "incremental", "temporary"]
ScheduleType = Literal["manual", "interval", "cron"]

SUPPORTED_PLATFORMS: set[str] = {
    "xiaohongshu",
    "weibo",
    "instagram",
    "pinterest",
    "tiktok",
    "website",
    "other",
}
SUPPORTED_CRAWL_MODES: set[str] = {"historical", "incremental", "temporary"}
SUPPORTED_SCHEDULE_TYPES: set[str] = {"manual", "interval", "cron"}


@dataclass(frozen=True)
class RateLimitPolicy:
    requests_per_minute: int = 30
    min_delay_seconds: float = 1.0
    max_concurrent_requests: int = 1
    respect_robots_txt: bool = True
    notes: str | None = None

    def validate(self) -> None:
        if self.requests_per_minute <= 0:
            raise ValueError("requests_per_minute must be greater than 0")
        if self.min_delay_seconds < 0:
            raise ValueError("min_delay_seconds must be greater than or equal to 0")
        if self.max_concurrent_requests <= 0:
            raise ValueError("max_concurrent_requests must be greater than 0")


@dataclass(frozen=True)
class SocialAccountSource:
    id: str
    platform: Platform
    account_name: str
    profile_url: str
    crawl_mode: CrawlMode = "historical"
    schedule_type: ScheduleType = "manual"
    max_items: int | None = None
    status: str = "active"
    last_crawled_at: datetime | None = None
    rate_limit_policy: RateLimitPolicy = field(default_factory=RateLimitPolicy)
    notes: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utc_now)

    def validate(self) -> None:
        validate_platform(self.platform)
        validate_crawl_mode(self.crawl_mode)
        validate_schedule_type(self.schedule_type)
        if not self.account_name.strip():
            raise ValueError("account_name is required")
        normalized_url = normalize_url(self.profile_url)
        if normalized_url is None:
            raise ValueError("profile_url must be a valid public URL")
        if self.max_items is not None and self.max_items < 1:
            raise ValueError("max_items must be greater than 0")
        self.rate_limit_policy.validate()


@dataclass(frozen=True)
class CrawlJob:
    id: str
    source_id: str
    platform: Platform
    crawl_mode: CrawlMode
    schedule_type: ScheduleType
    max_items: int | None = None
    status: str = "queued"
    rate_limit_policy: RateLimitPolicy = field(default_factory=RateLimitPolicy)
    interval_seconds: int | None = None
    cron_expression: str | None = None
    notes: str | None = None
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)
    last_run_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def validate(self) -> None:
        validate_platform(self.platform)
        validate_crawl_mode(self.crawl_mode)
        validate_schedule_type(self.schedule_type)
        if self.max_items is not None and self.max_items < 1:
            raise ValueError("max_items must be greater than 0")
        if self.schedule_type == "interval" and (
            self.interval_seconds is None or self.interval_seconds <= 0
        ):
            raise ValueError("interval jobs require interval_seconds greater than 0")
        if self.schedule_type == "cron" and not self.cron_expression:
            raise ValueError("cron jobs require cron_expression")
        self.rate_limit_policy.validate()


@dataclass(frozen=True)
class CrawlRun:
    id: str
    job_id: str
    source_id: str
    platform: Platform
    status: str = "running"
    started_at: datetime = field(default_factory=utc_now)
    finished_at: datetime | None = None
    image_count: int = 0
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def validate_platform(platform: str) -> None:
    if platform not in SUPPORTED_PLATFORMS:
        raise ValueError(f"unsupported platform: {platform}")


def validate_crawl_mode(crawl_mode: str) -> None:
    if crawl_mode not in SUPPORTED_CRAWL_MODES:
        raise ValueError(f"unsupported crawl_mode: {crawl_mode}")


def validate_schedule_type(schedule_type: str) -> None:
    if schedule_type not in SUPPORTED_SCHEDULE_TYPES:
        raise ValueError(f"unsupported schedule_type: {schedule_type}")
