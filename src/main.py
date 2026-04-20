import logging

from src.config import Settings
from src.crawlers import CrawlRequest, ExampleCrawler


def configure_logging(log_level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(levelname)s:%(name)s:%(message)s",
    )


def main() -> None:
    settings = Settings.from_env()
    configure_logging(settings.log_level)

    crawler = ExampleCrawler(settings)
    result = crawler.crawl(CrawlRequest(url="https://example.com"))

    print(
        "initialized example crawler "
        f"env={settings.app_env} "
        f"timeout={settings.crawl_timeout} "
        f"retry_count={settings.crawl_retry_count} "
        f"success={result.success}"
    )


if __name__ == "__main__":
    main()
