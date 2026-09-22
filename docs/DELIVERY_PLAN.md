# Distributed Crawler V1 Delivery Plan

Last updated: 2026-09-22

## Current Acceptance Audit

This is a delivery in progress, not final V1 acceptance. Later evidence below
supersedes earlier environment blockers in the historical recovery log.

- P0: verified recovered checkout and branch; old checkout preserved.
- P1: real API and browser flow PASSED using isolated PostgreSQL 16.15,
  controlled HTML/images, and actual Node Worker/Python extraction.
  Page creates source/job, queues work, displays four deduplicated assets.
  Bounded image download, repeated migrations and HTTP restart retention passed.
  CLI now defaults to the same management API; its mapping is unit-tested.
- P2: implementation partial. Host auth, leases, public HTTP bounds and DNS
  pinning are present; full claim/report races, cross-host recovery, durable
  backoff/rate limits and interval/incremental behavior remain to verify/fix.
- P3: local authenticated page running on 3100; 1440px desktop and 390px mobile
  browser workflow passed after fixing mobile overflow. Backup restore,
  operational health/failure coverage and sustained observation remain pending.
- Current tests: Python 26 passed; server unit tests 11 passed; Worker unit
  tests 5 passed; frontend build passed; installer failure cases 3 passed.
- Installer remote checkpoint: 3a1e01a600551a631a29f59e4bc79516a4255baa.
- Public HTTP/Worker extraction checkpoint: 155a133.
- Browser/Python/database P1 checkpoint: f9b6f54.
- Draft PR #7: https://github.com/leilei6878/image-crawler-system/pull/7
- Detailed interruption recovery: docs/recovery/2026-09-22-p1.md.
- Local Git now works through current-user external execution. A scoped
  installer checkpoint stash is retained as a backup; other changes preserved.

Known remaining correctness work:

- Source pause must stop existing jobs; update policy/URL must apply consistently.
- Bind assets/tasks to an individual run; current history queries use job_id.
- Enforce source rate limits in the database across Workers and persist cursors.
- Fence claim/report/cancel/timeout races and persist retry eligibility time.
- Bound run runtime and image count at the server, preserve original errors.
- Verify two Workers, interrupted Worker, retries, cancellation and real restarts.
- Verify MySQL migrations separately; current live evidence is PostgreSQL only.
- Complete restore rehearsal, soak metrics, secret review and final PR.

## Working Directory Decision

Use this directory as the delivery baseline:

`C:\Users\leile\Documents\Codex\2026-05-06\image-crawler-system-recovered`

Reasons:

- It contains the latest recovered implementation through `03d5fa6 feat: add social crawling management page`.
- It includes the Worker installer hardening, generic HTML extraction foundation, social crawling architecture v1, and the first `/social` management UI.
- The older directory `C:\Users\leile\Documents\Codex\2026-05-02\image-crawler-system-worker-pr-3` is on `master` at `3ce73c2 init: context recovery system`, has many untracked files, and is missing `AGENTS.md` plus `docs/PROJECT_CONTEXT.md`.
- The older directory is treated as evidence only. Do not overwrite, clean, or reset it.

Current delivery branch:

`codex/distributed-crawler-v1-delivery`

Baseline commit:

`03d5fa691cafc414d368ac0283c2e329ab240c64`

## Service Baseline

- Port `3000` is currently owned by the user's existing debug center and returns HTML for `/api/health` and `/api/social/meta`; it is not the Node API from this repository.
- Known preview ports checked during P0: `3001`, `3002`, `3003`, `5173`, `5175`, `5176`, `5177`, and `5000` were not reachable.
- Non-admin process command-line inspection was denied by Windows, so service ownership is recorded from available port and process-path evidence only.
- Do not stop or restart the existing `3000` service unless explicitly requested.
- To run this repository locally without disturbing the debug center, use a different `PORT` and set `BIND_HOST=127.0.0.1` unless a LAN Worker must connect.

## P0 Status

Done:

- Read `README.md`, `AGENTS.md`, `docs/PROJECT_CONTEXT.md`, and `docs/TODO.md`.
- Compared old and recovered directories.
- Confirmed `server/src/routes/social.js` started as an in-memory/demo route with `createPreviewImages`.
- Confirmed the real distributed Worker protocol already exists at `/api/tasks/pull` and `/api/tasks/report`.
- Created the delivery branch reference at `codex/distributed-crawler-v1-delivery` and pointed the current checkout at it.

Baseline checks:

- `python -m compileall -q src tests`: passed.
- `node --check server/src/index.js; node --check server/src/routes/social.js; node --check server/src/routes/tasks.js; node --check worker/src/index.js`: passed.
- Initial `python -m pytest -q -p no:cacheprovider`: blocked because the system Python environment did not have `pytest`.
- Created local `.venv` outside the restrictive sandbox and installed `requirements.txt`; `.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider` passed with 23 tests.
- `npm.cmd run build` in `web/`: blocked in sandbox with `spawn EPERM`, then passed when run outside the sandbox without administrator privileges.

## Delivery Phases

### P1 - Real Public-Page Business Path

Acceptance:

- The management page can create a public website source.
- The management page can create a job for that source.
- Existing Worker pulls the job through `/api/tasks/pull`.
- Worker executes the existing generic adapter against a controlled local HTML service.
- Worker reports images through `/api/tasks/report`.
- Results persist in the database and are visible from the UI.
- Normal execution no longer uses `createPreviewImages` or implicit demo arrays.
- Social platform adapters remain explicitly mock or unsupported.

Implemented:

- `/api/social` normal paths now read and write database-backed `social_sources`, `social_jobs`, and `social_runs`.
- Creating a website source job creates existing `jobs` and `page_tasks` records for the Worker protocol.
- Running a social website job queues the existing Worker task path; Worker report syncs social run/job/source status.
- Demo preview images and memory arrays are removed from the normal route.
- Social platforms remain marked mock/unsupported and are not executable in V1.

Remaining:

- Python CLI now uses the Node API by default; local JSON state requires explicit --demo.
- A real DB migration must be applied before running the Node server against an existing database.

### P2 - Reliability and Security

Acceptance:

- State machine distinguishes queued, running, completed, partial_failed, failed, cancelled, retry_waiting, and scheduled where applicable.
- Task claim is atomic and bounded by host/job concurrency.
- Task lease or timeout recovery prevents permanent running tasks after Worker crash.
- Worker report is idempotent for duplicate submissions.
- Manual, interval, and temporary jobs work; cron is rejected until implemented.
- Source limits, max items, timeouts, and access policy are enforced.
- SSRF protections are applied to page and image URLs, with localhost allowed only in explicit test mode.
- Worker identity and management API input validation are documented and tested.
- Worker installer native command failure handling remains verified.

Implemented:

- Task timeout recovery in the DB-backed scheduler.
- Interval social jobs are persisted and rescheduled with `next_run_at`; cron is rejected.
- Duplicate image URL reports for the same job are skipped.
- Cancelled tasks ignore late Worker reports.
- Worker pull/report requests require the registered `HOST_KEY`; task claims
  carry a short-lived lease token and stale reports are rejected.
- Worker applies the source rate limit policy before each crawl and the generic
  adapter checks same-origin `robots.txt` before navigation.
- Server and Worker URL policies block obvious localhost/private targets by default; controlled local tests require `ALLOW_LOCAL_CRAWL_TARGETS=true`.
- Worker V1 reports only `generic` support and rejects legacy platform site types.
- Management server defaults to `BIND_HOST=127.0.0.1`.

### P3 - Usability and Operations

Acceptance:

- UI supports source edit/disable, job run/cancel/retry, run history, image list, and error detail.
- Image download/storage is bounded by size, type, timeout, and dedupe limits.
- Empty, loading, failure, and no-worker states are visible.
- Start, stop, health-check, backup, and restore instructions run with current-user privileges.
- Docs clearly distinguish real server, mock/demo server, frontend URL, database, and Worker connection.

Implemented:

- Social page supports run/retry, cancel, run history, error detail, image list, mock/unsupported labels, and bounded image save.
- Image save endpoint enforces content type, size, timeout, redirect limit, URL policy, and local `downloads/` storage.
- Database migrations document backup/restore and separate PostgreSQL/MySQL scripts.
- Task lease columns and indexes are added by migration `003_task_leases`.

## Recovery Log

### 2026-09-22 P0

- Branch: `codex/distributed-crawler-v1-delivery`
- Baseline commit: `03d5fa691cafc414d368ac0283c2e329ab240c64`
- Validation:
  - Passed: Python compileall.
  - Passed: Node syntax checks for server/social/tasks/worker entrypoints.
  - Blocked: pytest missing from current Python environments.
  - Blocked: local venv `ensurepip` cannot write temporary pip wheel under sandbox.
  - Blocked: frontend build cannot spawn esbuild under sandbox.
- Next step:
  - Implement P1 by replacing memory-backed `/api/social` normal paths with persistent source/job/run records that create real `jobs` and `page_tasks`.

### 2026-09-22 P1-P3 Implementation

- Branch: `codex/distributed-crawler-v1-delivery`
- Validation:
  - Passed: `.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider` (`23 passed`).
  - Passed: Python compileall.
  - Passed: Node syntax checks for server routes/services and Worker adapters.
  - Passed: PowerShell parser checks for Worker installer scripts.
  - Passed: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check_worker_installer.ps1`; npm shim failure wrote `status=failed`.
  - Passed: `npm.cmd run build` in `web/` when executed outside sandbox; sandboxed run fails with esbuild `spawn EPERM`.
- Not executed:
  - Full real DB-backed end-to-end browser/Worker run. Port `3000` is the user's debug center, no repo `.env` is present, and no repository database service was confirmed.
  - Two-Worker contention, Worker crash recovery, and sustained runtime observation require a migrated test database and isolated service ports.
- Next step:
  - Apply migrations from `docs/DB_MIGRATIONS.md`, start this repository on a non-conflicting port, register/start Worker with matching `SERVER_URL`, then run the controlled HTML E2E checklist.

### 2026-09-22 Reliability and security correction

- Branch: `codex/distributed-crawler-v1-delivery`
- Changes:
  - Added default Worker `HOST_KEY` authentication on task pull/report.
  - Added host-serialized task claiming and `lease_token`/`lease_expires_at` recovery.
  - Added source rate-limit enforcement and same-origin `robots.txt` checks.
  - Added Node tests for URL policy, Worker auth, adapter support, rate limiting, and robots parsing.
- Validation status:
  - Python tests remain green (`23 passed`).
  - Node syntax checks pass; Node test runner needs an unsandboxed current-user invocation because sandbox child-process creation returns `spawn EPERM`.
- Next step:
  - Run Node tests and frontend build with the current-user external execution path, then create the remote branch/commit and PR through the GitHub connector because the local `.git` ACL rejects index writes.
