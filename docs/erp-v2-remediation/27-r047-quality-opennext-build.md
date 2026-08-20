# R-047 — Final quality and OpenNext build gate

Date: 2026-08-20

| Command | Result | Evidence |
| --- | --- | --- |
| `npm.cmd test` | PASS | 133 files / 548 tests passed. |
| `npm.cmd run typecheck` | PASS | TypeScript completed without errors. |
| `npm.cmd run build` | PASS | Next.js 16.3.0 built all 58 routes. |
| `npm.cmd run cf:build` | BLOCKED | OpenNext rebuilt the Next application successfully, then failed on Windows at `node:fs.symlink` with `EPERM` while tracing `read-excel-file` into `.open-next`. |

The failing OpenNext command printed its Windows compatibility warning and failed during local bundle generation; it did not upload, deploy, migrate, or call a Cloudflare remote environment. The error is an environment/platform capability boundary, not evidence of a passing Worker package.

```text
QUALITY_GATE=PARTIAL
OPENNEXT_BUILD=BLOCKED (Windows symlink permission)
R-047=BLOCKED
```
