from src.config import Settings
from src.crawlers import CrawlRequest, ExampleCrawler


def test_example_crawler_returns_success_result():
    settings = Settings(crawl_timeout=5, crawl_retry_count=1)
    crawler = ExampleCrawler(settings)

    result = crawler.crawl(CrawlRequest(url="https://example.com/gallery"))

    assert result.success is True
    assert result.url == "https://example.com/gallery"
    assert result.images == []
    assert result.metadata["source"] == "example"
    assert result.metadata["timeout"] == 5
    assert result.metadata["retry_count"] == 1
