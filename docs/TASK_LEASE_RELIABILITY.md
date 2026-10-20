# Task lease reliability regression

Baseline: PR #7 head `8b269975a97af95d24239be856947ed36ca43d96` was still open/draft with no newer remote fix when inspected on 2026-10-20. Local changes on the user's other machines are not visible here.

## Contract

- PostgreSQL `clock_timestamp()` issues and checks persisted `lease_expires_at`. The scheduler no longer reconstructs another deadline from `started_at` or current job settings. A missing deadline is an orphaned running task and is recoverable. A deadline equal to database time is expired.
- Lease duration remains at least 180 seconds, otherwise page + scroll + 90 seconds. Database time avoids API/scheduler machine clock skew. Host heartbeat loss does not itself revoke an unexpired lease.
- A transaction-scoped PostgreSQL advisory lock `(6878, 7)` serializes lifecycle writers: claim/report, timed recovery/finalization/queue, cancellation and explicit social re-run. This closes stale-read recovery/cancel/claim races and cross-host job quota races, including multiple API processes. Keep this lock first after BEGIN in new lifecycle writers.
- This is intentionally a coarse correctness lock. It serializes metadata transactions across jobs; report URL validation occurs within that section. It does not serialize actual crawling, but large reports or slow DNS can delay other lifecycle requests. Fine-grained locking needs separate load validation. MySQL was not validated; this patch targets the already verified PostgreSQL delivery backend.
- Reports require the assigned authenticated host and the current attempt token. Only running tasks with an unexpired lease can change task/asset/child state. Accepted reports retain their token as a receipt and clear their expiry. Repeating that attempt returns `duplicate: true` with no writes. A conflicting success after an accepted failed attempt is also a no-op: the first accepted report wins.
- Recovery/cancellation/reset invalidate the attempt token. Expired or replaced attempts receive 409, including after re-claim on the same host. A cancelled task returns a no-op acknowledgement. A cancelled-then-reset task rejects the obsolete attempt rather than writing assets.
- Generic cancellation now cancels running tasks and clears their leases too. Retry reports read `jobs.max_retry_count`, including zero, rather than a nonexistent page-task field.
- No changes to extractor/Worker/asset filtering, migrations, installation or web UI. Existing P1 acceptance is historical evidence, not a new full P1 run.

## Validation

Local automated checks:

```sh
npm ci --prefix server
npm test --prefix server
npm ci --prefix worker
npm test --prefix worker
```

`taskReport.test.js` uses mocked database responses and tests the actual report handler. It does not establish PostgreSQL isolation or multi-Worker behavior.

Real database regression (requires a PostgreSQL test account with CREATEDB; creates and drops a random isolated database, never migrates the supplied database):

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/postgres node server/test/taskLifecycle.postgres.cjs
```

PowerShell:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/postgres'
node server/test/taskLifecycle.postgres.cjs
```

The CI `PostgreSQL task lifecycle` job runs this script against PostgreSQL 16. It uses real route handlers over HTTP, concurrent same-host/cross-host requests, real migrations, and real database locks. Scenarios: live lease at 150-second task age, expiry and interrupted-worker simulation (no report), recovery, retry exhaustion/zero retry budget, stale success before/after recovery and re-claim, duplicate success/failure, asset deduplication, generic cancellation/reset, social cancellation/re-run, and job quota. It does not start actual crawler Worker processes and must not be called real multi-Worker crawling acceptance.

Full existing P1 real Worker/Python/browser flow remains `node server/test/real-flow.cjs`, documented in LOCAL_RUNTIME. Its private local database config and Windows Python executable path must be available. Full multi-Worker extraction, P2/P3 operational soak and MySQL remain outside this verification.
