from abc import ABC, abstractmethod
from dataclasses import replace
from typing import Iterable

from src.config import Settings
from src.crawlers import CrawlRequest, GenericHtmlAdapter
from src.fetching import HttpFetcher
from src.models import ImageAsset, normalize_url
from src.models.social import CrawlJob, RateLimitPolicy, SocialAccountSource


class AdapterCrawlError(RuntimeError):
    """Raised when an adapter cannot complete a compliant public crawl."""


class SourceAdapter(ABC):
    adapter_name = "base"
    supported_platforms: tuple[str, ...] = ()

    def __init__(
        self,
        settings: Settings,
        rate_limit_policy: RateLimitPolicy | None = None,
    ) -> None:
        self.settings = settings
        self.rate_limit_policy = rate_limit_policy or RateLimitPolicy()
        self.rate_limit_policy.validate()

    def can_handle(self, platform: str) -> bool:
        return platform in self.supported_platforms

    @abstractmethod
    def crawl_source(
        self,
        source: SocialAccountSource,
        job: CrawlJob,
        *,
        run_id: str | None = None,
    ) -> list[ImageAsset]:
        """Return public image assets for a configured source."""


class MockSocialAdapter(SourceAdapter):
    adapter_name = "mock_social_adapter"
    supported_platforms = (
        "xiaohongshu",
        "weibo",
        "instagram",
        "pinterest",
        "tiktok",
        "other",
    )

    def crawl_source(
        self,
        source: SocialAccountSource,
        job: CrawlJob,
        *,
        run_id: str | None = None,
    ) -> list[ImageAsset]:
        _ensure_supported(self, source)
        max_items = job.max_items or source.max_items or 3
        safe_account = _slug(source.account_name)
        images: list[ImageAsset] = []

        for index in range(1, max_items + 1):
            image_url = f"https://mock.local/{source.platform}/{safe_account}/image-{index}.jpg"
            normalized_url = normalize_url(image_url) or image_url
            images.append(
                ImageAsset(
                    source_name=self.adapter_name,
                    source_url=source.profile_url,
                    image_url=image_url,
                    normalized_image_url=normalized_url,
                    title=f"{source.account_name} mock image {index}",
                    alt_text=f"Mock public image {index}",
                    width=1200,
                    height=900,
                    content_type="image/jpeg",
                    metadata={
                        "mock": True,
                        "public_only": True,
                        "rate_limit_policy": {
                            "requests_per_minute": job.rate_limit_policy.requests_per_minute,
                            "max_concurrent_requests": job.rate_limit_policy.max_concurrent_requests,
                        },
                    },
                    platform=source.platform,
                    account_name=source.account_name,
                    profile_url=source.profile_url,
                    crawl_mode=job.crawl_mode,
                    schedule_type=job.schedule_type,
                    source_id=source.id,
                    job_id=job.id,
                    run_id=run_id,
                )
            )

        return images


class GenericPublicPageAdapter(SourceAdapter):
    adapter_name = "generic_public_page_adapter"
    supported_platforms = ("website",)

    def __init__(
        self,
        settings: Settings,
        *,
        fetcher: HttpFetcher | None = None,
        rate_limit_policy: RateLimitPolicy | None = None,
    ) -> None:
        super().__init__(settings, rate_limit_policy)
        self.crawler = GenericHtmlAdapter(settings, fetcher=fetcher)

    def crawl_source(
        self,
        source: SocialAccountSource,
        job: CrawlJob,
        *,
        run_id: str | None = None,
    ) -> list[ImageAsset]:
        _ensure_supported(self, source)
        result = self.crawler.crawl(
            CrawlRequest(
                url=source.profile_url,
                metadata={
                    "source_id": source.id,
                    "platform": source.platform,
                    "public_only": True,
                },
            )
        )
        if not result.success:
            raise AdapterCrawlError(result.error or "generic public page crawl failed")

        max_items = job.max_items or source.max_items
        assets: Iterable[ImageAsset] = result.images
        if max_items is not None:
            assets = list(assets)[:max_items]

        return [
            replace(
                asset,
                source_name=self.adapter_name,
                platform=source.platform,
                account_name=source.account_name,
                profile_url=source.profile_url,
                crawl_mode=job.crawl_mode,
                schedule_type=job.schedule_type,
                source_id=source.id,
                job_id=job.id,
                run_id=run_id,
                metadata={
                    **asset.metadata,
                    "adapter": self.adapter_name,
                    "public_only": True,
                },
            )
            for asset in assets
        ]


def _ensure_supported(adapter: SourceAdapter, source: SocialAccountSource) -> None:
    if not adapter.can_handle(source.platform):
        raise AdapterCrawlError(
            f"{adapter.adapter_name} does not support platform {source.platform}"
        )


def _slug(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    slug = "-".join(part for part in slug.split("-") if part)
    return slug or "account"
