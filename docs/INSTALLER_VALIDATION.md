# Worker Installer Failure Validation

Date: 2026-09-22
Branch: codex/distributed-crawler-v1-delivery
Baseline: 03d5fa691cafc414d368ac0283c2e329ab240c64

Run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_worker_installer.ps1
```

Verified results:

| Injected command | Native exit | Recorded step | Status | Batch exit |
| --- | --- | --- | --- | --- |
| npm.cmd install | 42 | install-worker-dependencies | failed | 1 |
| npx.cmd playwright install chromium | 43 | install-browser | failed | 1 |
| node --check | 44 | validate-worker-code | failed | 1 |

The verifier copies the installer and actual batch wrapper into a fresh
temporary directory. Each scenario has a separate status path. It checks the
native exit in the error message, so a filesystem error or an old failed
status cannot pass. Temporary .env files and logs are removed only after
checking that the resolved cleanup path remains inside the temporary root.

This validates failure propagation, not a full dependency/browser installation.
No administrator privileges, UAC, production endpoints, or real credentials
are used.

Recovery: continue distributed V1 integration in the recovered checkout.
The current database, Worker, and UI changes still need controlled end-to-end
validation; installer checks alone do not establish V1 delivery.
