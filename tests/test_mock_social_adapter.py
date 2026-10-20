from src.config import Settings
from src.models.social import CrawlJob, SocialAccountSource
from src.social import GenericPublicPageAdapter, MockSocialAdapter
from src.fetching.http import FetchResponse


class FakeFetcher:
    def fetch(self, url):
        return FetchResponse(
            url=url,
            status_code=200,
            content=b'<img src="/brand.jpg" alt="Brand image">',
            headers={"content-type": "text/html"},
        )


def test_mock_social_adapter_returns_public_image_assets():
    source = SocialAccountSource(
        id="source_1",
        platform="instagram",
        account_name="Example Brand",
        profile_url="https://example.com/example-brand",
        max_items=2,
    )
    job = CrawlJob(
        id="job_1",
        source_id=source.id,
        platform=source.platform,
        crawl_mode="historical",
        schedule_type="manual",
        max_items=2,
    )

    images = MockSocialAdapter(Settings()).crawl_source(source, job, run_id="run_1")

    assert len(images) == 2
    assert images[0].platform == "instagram"
    assert images[0].account_name == "Example Brand"
    assert images[0].crawl_mode == "historical"
    assert images[0].schedule_type == "manual"
    assert images[0].source_id == source.id
    assert images[0].job_id == job.id
    assert images[0].run_id == "run_1"
    assert images[0].metadata["public_only"] is True
    assert images[0].metadata["mock"] is True


def test_generic_public_page_adapter_reuses_html_extraction_without_login_state():
    source = SocialAccountSource(
        id="source_website",
        platform="website",
        account_name="Public Website",
        profile_url="https://example.com/gallery",
    )
    job = CrawlJob(
        id="job_website",
        source_id=source.id,
        platform=source.platform,
        crawl_mode="historical",
        schedule_type="manual",
    )

    adapter = GenericPublicPageAdapter(Settings(), fetcher=FakeFetcher())
    images = adapter.crawl_source(source, job, run_id="run_website")

    assert len(images) == 1
    assert images[0].normalized_image_url == "https://example.com/brand.jpg"
    assert images[0].platform == "website"
    assert images[0].metadata["public_only"] is True
    assert images[0].metadata["adapter"] == "generic_public_page_adapter"
