# Project Context

## Project Name
image-crawler-system

## Goal
Build a scalable and maintainable image crawler system for collecting high-quality design reference images from public platforms.

## Product Direction
This project is intended to support:
- keyword-based crawling
- multi-source image collection
- metadata extraction
- image downloading and storage
- deduplication
- future distributed task scheduling
- future proxy and anti-blocking support

## Current Development Principle
Prioritize engineering stability, maintainability, and extensibility over short-term hacks.

## Architecture Expectations
The system should gradually evolve into these modules:
- crawler adapters
- task manager
- downloader
- storage manager
- deduplication module
- scheduler
- proxy manager
- monitoring/logging

## Development Rules
- Avoid large rewrites unless clearly necessary
- Prefer incremental and reviewable changes
- Keep source/platform-specific logic isolated
- Do not hardcode credentials or sensitive values
- All runtime configs should come from env or config files
- Update documentation whenever behavior changes
- New modules should be written with future extensibility in mind

## Quality Expectations
- Local setup should be reproducible
- CI should validate basic quality automatically
- Logs should be readable and structured
- Failures should be retryable where appropriate
- Key commands should be documented clearly

## Near-Term Priorities
1. Make repo runnable and understandable
2. Add config standardization
3. Add CI checks
4. Add logging and error handling
5. Add retry and timeout support
6. Improve task abstraction****