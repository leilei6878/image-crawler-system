from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class SourceItem:
    source_name: str
    source_url: str
    title: str | None = None
    discovered_at: datetime = field(default_factory=utc_now)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ImageAsset:
    source_name: str
    source_url: str
    image_url: str
    normalized_image_url: str
    title: str | None = None
    alt_text: str | None = None
    width: int | None = None
    height: int | None = None
    content_type: str | None = None
    discovered_at: datetime = field(default_factory=utc_now)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CrawlResult:
    source_item: SourceItem
    images: list[ImageAsset] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
