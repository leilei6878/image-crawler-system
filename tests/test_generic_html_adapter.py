from src.config import Settings
from src.crawlers import CrawlRequest, GenericHtmlAdapter
from src.fetching.http import FetchResponse


class FakeFetcher:
    def fetch(self, url):
        return FetchResponse(
            url=url,
            status_code=200,
            content=b'<img src="/image.jpg" alt="Example">',
            headers={"content-type": "text/html"},
        )


def test_generic_html_adapter_fetches_and_extracts_assets():
    crawler = GenericHtmlAdapter(Settings(), fetcher=FakeFetcher())

    result = crawler.crawl(CrawlRequest(url="https://example.com/gallery"))

    assert result.success is True
    assert result.metadata["source"] == "generic_html"
    assert result.metadata["image_count"] == 1
    assert result.images[0].normalized_image_url == "https://example.com/image.jpg"
    assert result.images[0].alt_text == "Example"
