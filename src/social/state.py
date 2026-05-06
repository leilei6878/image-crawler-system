import json
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from src.models import ImageAsset
from src.models.social import CrawlJob, CrawlRun, RateLimitPolicy, SocialAccountSource
from src.social.registry import SourceAdapterRegistry
from src.social.scheduler import InMemoryCrawlScheduler


class JsonSocialStateStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load(self, registry: SourceAdapterRegistry) -> InMemoryCrawlScheduler:
        scheduler = InMemoryCrawlScheduler(registry)
        if not self.path.exists():
            return scheduler

        data = json.loads(self.path.read_text(encoding="utf-8"))
        scheduler.sources = {
            source_id: _source_from_dict(source)
            for source_id, source in data.get("sources", {}).items()
        }
        scheduler.jobs = {
            job_id: _job_from_dict(job)
            for job_id, job in data.get("jobs", {}).items()
        }
        scheduler.runs = {
            run_id: _run_from_dict(run)
            for run_id, run in data.get("runs", {}).items()
        }
        scheduler.images_by_run = {
            run_id: [_image_from_dict(image) for image in images]
            for run_id, images in data.get("images_by_run", {}).items()
        }
        return scheduler

    def save(self, scheduler: InMemoryCrawlScheduler) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "sources": scheduler.sources,
            "jobs": scheduler.jobs,
            "runs": scheduler.runs,
            "images_by_run": scheduler.images_by_run,
        }
        self.path.write_text(
            json.dumps(to_jsonable(data), indent=2, sort_keys=True),
            encoding="utf-8",
        )


def to_jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if is_dataclass(value):
        return to_jsonable(asdict(value))
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    return value


def _parse_datetime(value: str | None) -> datetime | None:
    if value in (None, ""):
        return None
    return datetime.fromisoformat(value)


def _policy_from_dict(data: dict[str, Any] | None) -> RateLimitPolicy:
    return RateLimitPolicy(**(data or {}))


def _source_from_dict(data: dict[str, Any]) -> SocialAccountSource:
    return SocialAccountSource(
        **{
            **data,
            "last_crawled_at": _parse_datetime(data.get("last_crawled_at")),
            "created_at": _parse_datetime(data.get("created_at")),
            "rate_limit_policy": _policy_from_dict(data.get("rate_limit_policy")),
        }
    )


def _job_from_dict(data: dict[str, Any]) -> CrawlJob:
    return CrawlJob(
        **{
            **data,
            "created_at": _parse_datetime(data.get("created_at")),
            "updated_at": _parse_datetime(data.get("updated_at")),
            "rate_limit_policy": _policy_from_dict(data.get("rate_limit_policy")),
        }
    )


def _run_from_dict(data: dict[str, Any]) -> CrawlRun:
    return CrawlRun(
        **{
            **data,
            "started_at": _parse_datetime(data.get("started_at")),
            "finished_at": _parse_datetime(data.get("finished_at")),
        }
    )


def _image_from_dict(data: dict[str, Any]) -> ImageAsset:
    return ImageAsset(
        **{
            **data,
            "discovered_at": _parse_datetime(data.get("discovered_at")),
        }
    )
