from dataclasses import dataclass, replace
from uuid import uuid4

from src.models import ImageAsset
from src.models.assets import utc_now
from src.models.social import (
    CrawlJob,
    CrawlMode,
    CrawlRun,
    Platform,
    RateLimitPolicy,
    ScheduleType,
    SocialAccountSource,
)
from src.social.registry import SourceAdapterRegistry


@dataclass(frozen=True)
class CrawlJobStatus:
    job: CrawlJob
    latest_run: CrawlRun | None = None
    images: list[ImageAsset] | None = None


class InMemoryCrawlScheduler:
    def __init__(self, registry: SourceAdapterRegistry) -> None:
        self.registry = registry
        self.sources: dict[str, SocialAccountSource] = {}
        self.jobs: dict[str, CrawlJob] = {}
        self.runs: dict[str, CrawlRun] = {}
        self.images_by_run: dict[str, list[ImageAsset]] = {}

    def create_source(
        self,
        *,
        platform: Platform,
        account_name: str,
        profile_url: str,
        crawl_mode: CrawlMode = "historical",
        schedule_type: ScheduleType = "manual",
        max_items: int | None = None,
        rate_limit_policy: RateLimitPolicy | None = None,
        notes: str | None = None,
    ) -> SocialAccountSource:
        source = SocialAccountSource(
            id=_new_id("source"),
            platform=platform,
            account_name=account_name,
            profile_url=profile_url,
            crawl_mode=crawl_mode,
            schedule_type=schedule_type,
            max_items=max_items,
            rate_limit_policy=rate_limit_policy or RateLimitPolicy(),
            notes=notes,
        )
        source.validate()
        self.registry.get(platform)
        self.sources[source.id] = source
        return source

    def create_job(
        self,
        *,
        source_id: str,
        crawl_mode: CrawlMode | None = None,
        schedule_type: ScheduleType | None = None,
        max_items: int | None = None,
        interval_seconds: int | None = None,
        cron_expression: str | None = None,
        notes: str | None = None,
    ) -> CrawlJob:
        source = self._get_source(source_id)
        resolved_schedule_type = schedule_type or source.schedule_type
        status = "scheduled" if resolved_schedule_type in {"interval", "cron"} else "queued"
        job = CrawlJob(
            id=_new_id("job"),
            source_id=source.id,
            platform=source.platform,
            crawl_mode=crawl_mode or source.crawl_mode,
            schedule_type=resolved_schedule_type,
            max_items=max_items if max_items is not None else source.max_items,
            status=status,
            rate_limit_policy=source.rate_limit_policy,
            interval_seconds=interval_seconds,
            cron_expression=cron_expression,
            notes=notes,
        )
        job.validate()
        self.jobs[job.id] = job
        return job

    def create_temporary_job(
        self,
        *,
        source_id: str,
        max_items: int | None = None,
        notes: str | None = None,
    ) -> CrawlJob:
        return self.create_job(
            source_id=source_id,
            crawl_mode="temporary",
            schedule_type="manual",
            max_items=max_items,
            notes=notes,
        )

    def run_job(self, job_id: str) -> CrawlRun:
        job = self._get_job(job_id)
        source = self._get_source(job.source_id)
        run = CrawlRun(
            id=_new_id("run"),
            job_id=job.id,
            source_id=source.id,
            platform=source.platform,
            status="running",
        )
        self.runs[run.id] = run
        self.jobs[job.id] = replace(
            job,
            status="running",
            updated_at=utc_now(),
            last_run_id=run.id,
        )

        try:
            adapter = self.registry.get(source.platform)
            images = adapter.crawl_source(source, self.jobs[job.id], run_id=run.id)
            finished = utc_now()
            completed_run = replace(
                run,
                status="completed",
                finished_at=finished,
                image_count=len(images),
                metadata={"adapter": adapter.adapter_name},
            )
            next_job_status = (
                "scheduled" if job.schedule_type in {"interval", "cron"} else "completed"
            )
            self.runs[run.id] = completed_run
            self.images_by_run[run.id] = images
            self.jobs[job.id] = replace(
                self.jobs[job.id],
                status=next_job_status,
                updated_at=finished,
                last_run_id=run.id,
            )
            self.sources[source.id] = replace(source, last_crawled_at=finished)
            return completed_run
        except Exception as exc:
            finished = utc_now()
            failed_run = replace(
                run,
                status="failed",
                finished_at=finished,
                error=str(exc),
            )
            self.runs[run.id] = failed_run
            self.images_by_run[run.id] = []
            self.jobs[job.id] = replace(
                self.jobs[job.id],
                status="failed",
                updated_at=finished,
                last_run_id=run.id,
            )
            return failed_run

    def get_job_status(self, job_id: str) -> CrawlJobStatus:
        job = self._get_job(job_id)
        latest_run = self.runs.get(job.last_run_id) if job.last_run_id else None
        images = self.images_by_run.get(latest_run.id, []) if latest_run else []
        return CrawlJobStatus(job=job, latest_run=latest_run, images=images)

    def _get_source(self, source_id: str) -> SocialAccountSource:
        try:
            return self.sources[source_id]
        except KeyError as exc:
            raise KeyError(f"source not found: {source_id}") from exc

    def _get_job(self, job_id: str) -> CrawlJob:
        try:
            return self.jobs[job_id]
        except KeyError as exc:
            raise KeyError(f"job not found: {job_id}") from exc


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"
