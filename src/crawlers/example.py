from src.crawlers.base import BaseCrawler, CrawlRequest, CrawlResult


class ExampleCrawler(BaseCrawler):
    source_name = "example"

    def crawl(self, request: CrawlRequest) -> CrawlResult:
        self._log_start(request)

        return CrawlResult(
            url=request.url,
            success=True,
            images=[],
            metadata={
                "source": self.source_name,
                "timeout": self.settings.crawl_timeout,
                "retry_count": self.settings.crawl_retry_count,
            },
        )
