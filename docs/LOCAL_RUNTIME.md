# Local Runtime

The crawler is separate from the debug center. Default crawler URL:
`http://127.0.0.1:3100/social`. PostgreSQL listens only on loopback port 55432.
No service registration, UAC, administrator privileges, or changes to port 3000.

## Prerequisites

- Node.js 20+, Python 3.12+, and dependencies in server, web, worker and .venv.
- Download the PostgreSQL 16 binary ZIP linked from
  [PostgreSQL for Windows](https://www.postgresql.org/download/windows/).
  Extract so `data/runtime/postgresql-16/pgsql/bin/pg_ctl.exe` exists.
  This is a local runtime only and must not be committed.
- The generic Worker fetches public static HTML and uses the Python extractor.
  It does not execute page JavaScript, use login sessions, or call private APIs.

## Start

From the repository root, in a normal PowerShell terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local_database.ps1 -Action start
node server/scripts/migrate.js --local
npm.cmd run build --prefix web
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local_runtime.ps1 -Action start
```

The first database start creates an isolated cluster only when none exists.
Random credentials are generated in ignored `data/local-db.json` and
`data/local-auth.json`. Use `adminToken` from the latter to sign into the page.
Keep both files private. The Worker reads its own host and registration keys
from that file. Other devices must use separately generated host keys.

The same origin serves the compiled page and API. The management API requires
a bearer credential; Worker task pull/report requires host identity and lease.
Use `-Port` if 3100 is occupied. Startup fails instead of stopping an existing
process. Local crawl targets stay blocked unless the explicit
`-AllowLocalTestTargets` option is supplied for a controlled test.

## Status and Stop

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local_runtime.ps1 -Action status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local_runtime.ps1 -Action stop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local_database.ps1 -Action stop
```

Stop verifies PID, executable and process creation time from the crawler's
own state file before terminating a process. It never kills by port/name.
The database stop targets only the explicit local cluster directory.
Application logs are in ignored `logs/server.*.log` and `logs/worker.*.log`.

## Controlled Integration

```powershell
node server/test/real-flow.cjs
$env:BROWSER_CHECK='true'
node server/test/real-flow.cjs
```

Each invocation creates a separately named test database in the local cluster.
It runs a local HTML/image/robots fixture and a real Worker, applies migrations
twice, checks management authentication, verifies persisted assets and bounded
image saving, then reopens the HTTP server and verifies retained data.
Browser mode uses locally installed Chrome through Playwright, creates source
and job through the page, and checks desktop and 390px mobile layout.
Fixtures, logs, database contents and screenshots stay in ignored directories.

An HTTP server restart is not a PostgreSQL process restart or power-loss test.
The remaining reliability and backup/restore checks are tracked in DELIVERY_PLAN.
