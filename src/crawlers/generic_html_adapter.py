from src.crawlers.base import BaseCrawler, CrawlRequest, CrawlResult
from src.extractors import extract_image_assets
from src.fetching import FetchError, HttpFetcher
from src.models import normalize_url


class GenericHtmlAdapter(BaseCrawler):
    source_name = "generic_html"

    def __init__(self, *args, fetcher: HttpFetcher | None = None, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.fetcher = fetcher or HttpFetcher.from_settings(self.settings)

    def crawl(self, request: CrawlRequest) -> CrawlResult:
        self._log_start(request)
        normalized_url = normalize_url(request.url)
        if normalized_url is None:
            return CrawlResult(
                url=request.url,
                success=False,
                error=f"Invalid URL: {request.url}",
                metadata={"source": self.source_name, "error_type": "invalid_url"},
            )

        try:
            response = self.fetcher.fetch(normalized_url)
        except FetchError as exc:
            return CrawlResult(
                url=normalized_url,
                success=False,
                error=exc.details.message,
                metadata={
                    "source": self.source_name,
                    "error_type": exc.details.error_type,
                    "status_code": exc.details.status_code,
                    "attempts": exc.details.attempts,
                },
            )

        images = extract_image_assets(
            response.text,
            source_url=normalized_url,
            source_name=self.source_name,
        )
        return CrawlResult(
            url=normalized_url,
            success=True,
            images=images,
            metadata={
                "source": self.source_name,
                "status_code": response.status_code,
                "content_type": response.headers.get("content-type"),
                "image_count": len(images),
            },
        )
