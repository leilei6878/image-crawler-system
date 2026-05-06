# TODO

## Foundation

- [x] Add repository foundation documentation.
- [x] Add sample environment configuration.
- [x] Add initial CI workflow.
- [x] Harden Worker installer native command failure handling.

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

- [ ] Add persistence interface for crawl results and image metadata.
- [x] Add scheduler/queue interface for crawl jobs.
- [x] Add source adapter registry.
- [x] Add social media brand account architecture V1 with mock adapters.
- [ ] Research social media public profile adapter boundaries.
- [x] Define initial rate limit policy and source policy handling.
- [x] Add first social crawling UI/API management surface.
- [ ] Persist social crawling sources, jobs, and runs in the production database.
- [ ] Replace local CLI JSON state with a durable persistence backend.
- [ ] Add real platform adapter design docs before implementation.

## Backlog

- [ ] Add binary image download and storage strategy.
- [ ] Add tests for URL normalization edge cases and image extraction behavior.
- [ ] Add local developer setup instructions after operational dependencies are selected.
- [ ] Add CI checks for linting after application code grows.
- [ ] Define operational metrics and failure reporting.
