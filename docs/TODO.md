# TODO

## Foundation

- [x] Add repository foundation documentation.
- [x] Add sample environment configuration.
- [x] Add initial CI workflow.
- [x] Harden Worker installer native command failure handling.
- [x] Add distributed crawler V1 delivery plan and recovery log.

## Minimal Python Project

- [x] Choose Python as the primary runtime.
- [x] Add minimal `src/` and `tests/` project structure.
- [x] Add dependency management with `requirements.txt`.
- [x] Add environment-based settings loader.
- [x] Add base crawler interface and example crawler adapter.
- [x] Add pytest tests for settings and crawler initialization.
- [x] Upgrade CI to install Python dependencies and run pytest.

## Generic Image Extraction Foundation

- [x] Implement a real HTTP fetch layer with timeout and retry behavior.
- [x] Define normalized image metadata models and URL validation rules.
- [x] Add generic HTML image extraction for `img`, `srcset`, Open Graph image, and `image_src` links.
- [x] Add a generic HTML adapter without source-specific login or bypass behavior.
- [x] Add tests for URL normalization, HTML extraction, and fetcher configuration.

## Next Engineering Tasks

- [x] Replace memory-backed `/api/social` normal path with persistent database-backed sources, jobs, runs, and assets.
- [x] Connect social/public-page management jobs to existing Worker task pull/report protocol.
- [x] Add persistence interface for social crawl results and image metadata.
- [x] Add scheduler/queue interface for crawl jobs.
- [x] Add source adapter registry.
- [x] Add social media brand account architecture V1 with mock adapters.
- [ ] Research social media public profile adapter boundaries.
- [x] Define initial rate limit policy and source policy handling.
- [x] Add first social crawling UI/API management surface.
- [x] Persist social crawling sources, jobs, and runs in the production database.
- [x] Point normal CLI operations at the same management API as the page; keep JSON state only under explicit --demo.
- [ ] Add real platform adapter design docs before implementation.
- [x] Add DB-backed interval scheduling and timeout recovery for Worker tasks.
- [x] Add Worker identity checks and initial task leases.
- [ ] Validate cross-Worker races, durable source limits, retry backoff, run history and cursors.
- [x] Enforce generic adapter robots.txt policy before public-page navigation.
- [x] Disable legacy platform adapters in Worker V1; keep social platforms mock/unsupported.
- [x] Add SSRF guardrails for crawl targets and image downloads.

## Backlog

- [x] Add bounded binary image download and local storage strategy.
- [ ] Add tests for URL normalization edge cases and image extraction behavior.
- [ ] Add local developer setup instructions after operational dependencies are selected.
- [ ] Add CI checks for linting after application code grows.
- [ ] Define operational metrics and failure reporting.
- [ ] Complete distributed V1 acceptance: two Workers, interruption recovery, DB process restart, backup/restore and bounded soak.
