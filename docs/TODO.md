# TODO

## Foundation

- [x] Add repository foundation documentation.
- [x] Add sample environment configuration.
- [x] Add initial CI workflow.

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
- [ ] Add scheduler/queue for crawl jobs.
- [ ] Add source adapter registry.
- [ ] Research social media public profile adapter boundaries.
- [ ] Define rate limit policy and source policy handling.
- [ ] Design UI/API management surface.

## Backlog

- [ ] Add binary image download and storage strategy.
- [ ] Add tests for URL normalization edge cases and image extraction behavior.
- [ ] Add local developer setup instructions after operational dependencies are selected.
- [ ] Add CI checks for linting after application code grows.
- [ ] Define operational metrics and failure reporting.
