from src.config import Settings
from src.social import InMemoryCrawlScheduler, create_default_registry


def make_scheduler():
    return InMemoryCrawlScheduler(create_default_registry(Settings()))


def test_manual_job_status_flow_completes_with_mock_adapter_images():
    scheduler = make_scheduler()
    source = scheduler.create_source(
        platform="weibo",
        account_name="Example Brand",
        profile_url="https://example.com/weibo/example-brand",
        max_items=2,
    )
    job = scheduler.create_job(source_id=source.id)

    assert job.status == "queued"

    run = scheduler.run_job(job.id)
    status = scheduler.get_job_status(job.id)

    assert run.status == "completed"
    assert run.image_count == 2
    assert status.job.status == "completed"
    assert status.latest_run == run
    assert status.images is not None
    assert len(status.images) == 2
    assert scheduler.sources[source.id].last_crawled_at is not None


def test_interval_job_returns_to_scheduled_after_run():
    scheduler = make_scheduler()
    source = scheduler.create_source(
        platform="pinterest",
        account_name="Interval Brand",
        profile_url="https://example.com/pinterest/interval-brand",
        schedule_type="interval",
        max_items=1,
    )
    job = scheduler.create_job(source_id=source.id, interval_seconds=3600)

    assert job.status == "scheduled"

    run = scheduler.run_job(job.id)
    status = scheduler.get_job_status(job.id)

    assert run.status == "completed"
    assert status.job.status == "scheduled"
    assert run.image_count == 1


def test_temporary_job_uses_temporary_crawl_mode():
    scheduler = make_scheduler()
    source = scheduler.create_source(
        platform="other",
        account_name="One-off Page",
        profile_url="https://example.com/temporary",
    )
    job = scheduler.create_temporary_job(source_id=source.id, max_items=1)

    run = scheduler.run_job(job.id)
    status = scheduler.get_job_status(job.id)

    assert job.crawl_mode == "temporary"
    assert run.status == "completed"
    assert status.job.status == "completed"
    assert status.images is not None
    assert status.images[0].crawl_mode == "temporary"
