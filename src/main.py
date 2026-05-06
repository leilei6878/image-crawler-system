import argparse
import json
import logging
from pathlib import Path

from src.config import Settings
from src.crawlers import CrawlRequest, ExampleCrawler
from src.models.social import (
    SUPPORTED_CRAWL_MODES,
    SUPPORTED_PLATFORMS,
    SUPPORTED_SCHEDULE_TYPES,
    RateLimitPolicy,
)
from src.social import create_default_registry
from src.social.state import JsonSocialStateStore, to_jsonable


def configure_logging(log_level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(levelname)s:%(name)s:%(message)s",
    )


def main(argv: list[str] | None = None) -> None:
    settings = Settings.from_env()
    configure_logging(settings.log_level)

    parser = build_parser(settings)
    args = parser.parse_args(argv)

    if args.command:
        run_social_cli(args, settings)
        return

    crawler = ExampleCrawler(settings)
    result = crawler.crawl(CrawlRequest(url="https://example.com"))

    print(
        "initialized example crawler "
        f"env={settings.app_env} "
        f"timeout={settings.crawl_timeout} "
        f"retry_count={settings.crawl_retry_count} "
        f"success={result.success}"
    )


def build_parser(settings: Settings) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="image-crawler-system CLI")
    parser.add_argument(
        "--state-file",
        default=str(Path(settings.data_dir) / "social_crawler_state.json"),
        help="Local JSON state file for the in-memory social crawler CLI.",
    )
    subparsers = parser.add_subparsers(dest="command")

    source_parser = subparsers.add_parser("create-social-source")
    source_parser.add_argument("--platform", required=True, choices=sorted(SUPPORTED_PLATFORMS))
    source_parser.add_argument("--account-name", required=True)
    source_parser.add_argument("--profile-url", required=True)
    source_parser.add_argument("--crawl-mode", default="historical", choices=sorted(SUPPORTED_CRAWL_MODES))
    source_parser.add_argument("--schedule-type", default="manual", choices=sorted(SUPPORTED_SCHEDULE_TYPES))
    source_parser.add_argument("--max-items", type=int)
    source_parser.add_argument("--requests-per-minute", type=int, default=30)
    source_parser.add_argument("--min-delay-seconds", type=float, default=1.0)
    source_parser.add_argument("--max-concurrent-requests", type=int, default=1)
    source_parser.add_argument("--notes")

    job_parser = subparsers.add_parser("create-job")
    job_parser.add_argument("--source-id", required=True)
    job_parser.add_argument("--crawl-mode", choices=sorted(SUPPORTED_CRAWL_MODES))
    job_parser.add_argument("--schedule-type", choices=sorted(SUPPORTED_SCHEDULE_TYPES))
    job_parser.add_argument("--max-items", type=int)
    job_parser.add_argument("--interval-seconds", type=int)
    job_parser.add_argument("--cron-expression")
    job_parser.add_argument("--notes")

    run_parser = subparsers.add_parser("run-job")
    run_parser.add_argument("--job-id", required=True)

    status_parser = subparsers.add_parser("job-status")
    status_parser.add_argument("--job-id", required=True)

    return parser


def run_social_cli(args: argparse.Namespace, settings: Settings) -> None:
    registry = create_default_registry(settings)
    state_store = JsonSocialStateStore(args.state_file)
    scheduler = state_store.load(registry)

    if args.command == "create-social-source":
        source = scheduler.create_source(
            platform=args.platform,
            account_name=args.account_name,
            profile_url=args.profile_url,
            crawl_mode=args.crawl_mode,
            schedule_type=args.schedule_type,
            max_items=args.max_items,
            rate_limit_policy=RateLimitPolicy(
                requests_per_minute=args.requests_per_minute,
                min_delay_seconds=args.min_delay_seconds,
                max_concurrent_requests=args.max_concurrent_requests,
            ),
            notes=args.notes,
        )
        state_store.save(scheduler)
        print_json({"source": source})
        return

    if args.command == "create-job":
        job = scheduler.create_job(
            source_id=args.source_id,
            crawl_mode=args.crawl_mode,
            schedule_type=args.schedule_type,
            max_items=args.max_items,
            interval_seconds=args.interval_seconds,
            cron_expression=args.cron_expression,
            notes=args.notes,
        )
        state_store.save(scheduler)
        print_json({"job": job})
        return

    if args.command == "run-job":
        run = scheduler.run_job(args.job_id)
        state_store.save(scheduler)
        print_json({"run": run, "status": scheduler.get_job_status(args.job_id)})
        return

    if args.command == "job-status":
        print_json({"status": scheduler.get_job_status(args.job_id)})
        return

    raise ValueError(f"unsupported command: {args.command}")


def print_json(value: object) -> None:
    print(json.dumps(to_jsonable(value), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
