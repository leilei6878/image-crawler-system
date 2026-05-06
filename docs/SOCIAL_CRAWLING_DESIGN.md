# Social Crawling Design V1

## Scope

This is the first architecture slice for social brand account image crawling.
It lets the system represent a public brand account or public page URL, create
crawl jobs, route jobs through a platform adapter registry, and run jobs through
an in-memory scheduler.

This version intentionally does not implement real platform crawling for
Xiaohongshu, Weibo, Instagram, Pinterest, TikTok, or similar platforms. It uses
a mock social adapter and a generic public page adapter so the contracts are
testable before platform-specific research starts.

## Supported Crawl Modes

- `historical`: intended for collecting public historical image metadata from a
  configured source.
- `incremental`: intended for future runs that only collect new public items
  since the last successful crawl.
- `temporary`: intended for one-off URLs or short-lived investigations that do
  not become a durable scheduled source.

## Schedule Types

- `manual`: one-shot job created and run explicitly.
- `interval`: recurring job interface with an `interval_seconds` value. V1 keeps
  execution in memory so a future scheduler can replace the implementation.
- `cron`: recurring job interface with a `cron_expression`. V1 validates that a
  cron expression exists but does not run a background cron daemon.

## Platform Adapter Design

The shared adapter interface is `SourceAdapter`.

Each adapter declares:

- `adapter_name`
- `supported_platforms`
- `rate_limit_policy`
- `crawl_source(source, job, run_id=None)`

The registry maps a platform to one adapter. The default registry installs:

- `mock_social_adapter` for `xiaohongshu`, `weibo`, `instagram`, `pinterest`,
  `tiktok`, and `other`.
- `generic_public_page_adapter` for `website`.

The mock adapter returns deterministic public-looking `ImageAsset` records. The
generic public page adapter reuses the existing generic HTML image extraction
layer and only works against a public page URL.

## Data Model

V1 introduces:

- `SocialAccountSource`: platform, account name, profile URL, crawl mode,
  schedule type, max items, status, last crawled time, rate limit policy, and
  notes.
- `CrawlJob`: source reference, crawl mode, schedule type, max items, status,
  interval or cron configuration, and rate limit policy.
- `CrawlRun`: per-execution status, timing, image count, error, and metadata.
- `ImageAsset` extensions: platform, account name, profile URL, crawl mode,
  schedule type, source ID, job ID, and run ID.

## Scheduling

The V1 scheduler is `InMemoryCrawlScheduler`. It supports:

- Creating sources.
- Creating manual, interval, cron, and temporary jobs.
- Running jobs synchronously.
- Recording the latest run and discovered image assets.
- Returning job status for CLI/API use.

The interface is deliberately small so it can be replaced later by Redis Queue,
Celery, APScheduler, or a database-backed scheduler.

## Safety Boundary

All adapters must follow these rules:

- Only crawl public content that is accessible without login.
- Do not bypass login, CAPTCHA, device checks, bot defenses, or rate limits.
- Do not use stolen, copied, or hard-coded cookies.
- Do not reverse-engineer private APIs or ship cracked endpoints.
- Do not run high-volume request loops or bulk scraping patterns.
- Respect robots.txt and platform rules where applicable.
- Define and enforce a rate limit policy for every platform adapter.
- Never commit tokens, cookies, credentials, proxy accounts, or production
  configuration.

## Future Platform Integration

Real platform adapters should be developed separately after public-access and
policy research:

- Xiaohongshu: research public profile/page accessibility and allowed metadata.
- Weibo: research public account pages and robots/policy boundaries.
- Instagram: only public, unauthenticated pages if allowed; no login cookies.
- Pinterest: public page research, rate limit policy, and metadata contracts.
- TikTok: public profile/page research without bypassing platform controls.

Before any real adapter is merged, it should include:

- A written source policy note.
- A conservative rate limit policy.
- Tests with fake HTML or mock responses.
- No secrets, cookies, accounts, or production endpoints.
