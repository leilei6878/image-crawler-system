# Project Context

## Project Name

`image-crawler-system`

## Current Stage

恢复后的分布式图片采集 V1 交付阶段。项目已经具备 Python generic HTML 图片提取基础层、Node 管理端、Worker 拉取/回传协议、Worker 安装器修复，以及社媒采集架构和第一版管理页。当前交付重点是把公开网页真实采集链路从页面、任务、Worker、数据库到结果查看打通，并移除正常路径上的内存 demo 数据。

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
- Do not treat mock social adapters or demo preview images as successful production crawling.
- Do not disturb unrelated debug-center services, ports, or local processes.

## Initial Architecture Assumptions

- Node.js powers the management server and distributed Worker protocol.
- Python owns generic HTML fetching, extraction, URL normalization, and testable crawler primitives.
- Configuration is environment-driven first, with public examples in `.env.example`.
- Crawling should be split into fetch, parse, normalize, store, and report stages.
- Network access should use bounded concurrency, retries, timeouts, and user-agent configuration.
- Persistent business state should be owned by the management server database, not by parallel memory or CLI-only stores.
- CI should install dependencies, compile Python files, and run pytest.

## Open Decisions

- Production queue or scheduler technology beyond the current DB-backed task table.
- Final durable storage backend and migration strategy for social sources, crawl runs, and image assets.
- Asset storage strategy for downloaded images.
- Source policy handling and robots.txt behavior.
- Deployment target.
