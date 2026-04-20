# image-crawler-system

Foundation repository for an image crawler system.

## Purpose

`image-crawler-system` is intended to collect image metadata and source assets from configured targets, process them through a predictable pipeline, and make the results available for downstream storage, indexing, or review workflows.

## Repository Status

This repository currently contains project foundation files only. Runtime code, crawler adapters, persistence, and deployment configuration still need to be implemented.

## Expected Capabilities

- Configure crawl targets through environment variables or runtime configuration.
- Fetch image pages and image assets with rate limits and retry behavior.
- Extract image URLs, source page metadata, and crawl status.
- Store crawl results in a durable backend.
- Run validation and CI checks before changes are merged.

## Getting Started

1. Copy the sample environment file:

   ```sh
   cp .env.example .env
   ```

2. Fill in the required values in `.env`.
3. Review the project context in `docs/PROJECT_CONTEXT.md`.
4. Review current work items in `docs/TODO.md`.

## Local Validation

The current CI workflow validates that required foundation files exist:

```sh
test -f README.md
test -f docs/PROJECT_CONTEXT.md
test -f docs/TODO.md
test -f AGENTS.md
test -f .github/workflows/ci.yml
test -f .env.example
```

On Windows PowerShell:

```powershell
Test-Path README.md
Test-Path docs/PROJECT_CONTEXT.md
Test-Path docs/TODO.md
Test-Path AGENTS.md
Test-Path .github/workflows/ci.yml
Test-Path .env.example
```

## Documentation

- `docs/PROJECT_CONTEXT.md` captures the current project assumptions and boundaries.
- `docs/TODO.md` tracks near-term engineering work.
- `AGENTS.md` defines contribution guidance for AI coding agents.
