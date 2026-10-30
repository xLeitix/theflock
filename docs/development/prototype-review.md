# Local prototype independent review — 30 October 2026

Reviewer: a separate subagent from the backend, frontend and runtime implementers. Scope: integrated local runtime, API security and concurrency contracts, development-file exposure, tests and prototype/production design boundaries. Source inspection only; execution evidence belongs to the coordinator and is recorded in [the validation ledger](design-changes.md).

## Initial findings and disposition

| Finding | Initial severity | Correction and evidence | Final status |
| --- | --- | --- | --- |
| Vite could expose ignored runtime credentials via filesystem routes | High | Explicit allow/deny in apps/web/vite.config.ts; coordinator live request returned403 | Closed |
| Feeding observation window ran before committed replay lookup | Medium | New-operation-only time validation in apps/api/src/app.ts; both creation paths covered in tests/api.test.ts | Closed |
| Helper lease or retention deadline could expire during a fence wait | Medium | Post-fence checks and conditional deadline/assignment predicates; blocked-fence regressions | Closed |
| Automatic stale-lock recovery had a check/delete race | Medium | Fail closed on existing locks; concurrency tests and documented manual recovery | Closed |

The coordinator also corrected logout/session resurrection before this review, using session revocation tombstones and guarded set/touch operations. The reviewer accepted that design structurally. The production design now includes the implementation-discovered replay and deadline contracts; the ledger distinguishes these corrections from deferred features.

## Final reviewer verdict

“All four previous findings are closed in the reviewed code. No additional substantive issue found in this focused recheck. Acceptable for the documented local, fictional-data milestone.”

Reviewer evidence: Vite restrictions at vite.config.ts:7; observation checks in app.ts:121/133 and regressions in api.test.ts:138; post-fence revalidation at app.ts:182 and regressions in api.test.ts:153; lock handling at runtime.mjs:91, runtime.test.mjs:8 and README.md:24. Line numbers refer to this reviewed snapshot.

Reviewed SHA-256 prefixes: app.ts `76f90f7e9baf9769`; runtime.mjs `164df664411346dd`; vite.config.ts `6494f79b9f1ae11d`; api.test.ts `85b3e218b18f8b81`; runtime.test.mjs `ff567d314d84880b`.

This is acceptance of the first local prototype, not of production deployment, genuine Facebook authentication, TLS, physical retention cleanup, backups or the other explicitly deferred production requirements. See the [development plan](prototype-plan.md).
