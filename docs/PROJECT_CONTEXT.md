# Project Context

## Project Name

`image-crawler-system`

## Current Stage

Repository foundation. The project structure and engineering guardrails are being established before application code is added.

## Problem Statement

Build a crawler system that can discover, fetch, and record image assets from configured sources while respecting operational limits such as rate limiting, retries, robots policies, and source-specific rules.

## Goals

- Provide a configurable image crawling pipeline.
- Separate crawler adapters, extraction logic, persistence, and orchestration.
- Keep crawling behavior observable through logs, metrics, and crawl status records.
- Make local validation and CI checks easy to run.
- Avoid committing secrets or environment-specific configuration.

## Non-Goals

- Do not hard-code production credentials.
- Do not couple crawler logic to a single source unless the source is explicitly scoped.
- Do not bypass source access policies, authentication requirements, or rate limits.
- Do not add unrelated framework or infrastructure choices before the runtime architecture is defined.

## Initial Architecture Assumptions

- Configuration will be environment-driven at first, with room for typed configuration later.
- Crawling should be split into fetch, parse, normalize, store, and report stages.
- Network access should use bounded concurrency, retries, timeouts, and user-agent configuration.
- Storage should be abstracted behind a small interface so the backend can be selected deliberately.
- CI should start small and become stricter as implementation code is added.

## Open Decisions

- Primary language and runtime.
- Queue or scheduler technology.
- Storage backend for image metadata and crawl state.
- Asset storage strategy for downloaded images.
- Source policy handling and robots.txt behavior.
- Deployment target.
