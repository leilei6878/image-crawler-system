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

## Next Engineering Tasks

- [ ] Implement a real HTTP fetch layer with timeout and retry behavior.
- [ ] Define normalized image metadata models and URL validation rules.
- [ ] Implement the first real source adapter with structured logging.

## Backlog

- [ ] Add persistence interface for crawl results and image metadata.
- [ ] Add tests for URL normalization and image extraction behavior.
- [ ] Add local developer setup instructions after the runtime is selected.
- [ ] Add CI checks for linting after application code grows.
- [ ] Define operational metrics and failure reporting.
