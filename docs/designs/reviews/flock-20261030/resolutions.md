# Independent review and resolutions

Review coverage: complete for the single requested independent architecture-review role, using a fresh conversation. Five separate specialist designs were integrated first. The reviewer inspected the full design, requirements, provider evidence, mockup inventory and mobile/desktop map renders.

Original result: **0 Blockers, 3 Majors, 0 Nits**. The original [JSON report](independent-report.json), [reviewed snapshot](round-01/target.md), packet and manifest are preserved. The reviewer did not execute application tests, provider login, IAM, deployment or recovery. Only the two map artboards were visually inspected; other mockup screens were inspected through the inventory.

## Dispositions

| Run finding | Original ID | Disposition | Applied design correction | Required implementation verification |
|---|---|---|---|---|
| FLOCK-001 | F1 | Fixed in design; independent recheck pending | Account write serialization in section4 now applies to all user-owned mutations and session writes, not only claims. Separate authGeneration/writeFence counters serialize deletion/suspension; async image/export reservation and finalization are fenced. Erasure completion waits for bounded in-flight work and object reconciliation. | Pause an authorized write, complete the deletion-state transition, resume and prove no later record/session/ready object can appear; test abandoned work cleanup and truthful completion. |
| FLOCK-002 | F2 | Fixed in design; independent recheck pending | Parent visibility in section4 requires both parent and child to be visible on all public projections/direct reads. A parent fence serializes hide-vs-write; hiding removes helper assignments. Only reporter/moderator keep restricted private access. Unhide never revives revoked assignments or deleted children. | Known child URL returns404 and no coordinates after parent hide; verify lists/counts/cursors, private ACL and hide/write/unhide races. |
| FLOCK-003 | F3 | Fixed in design; independent recheck pending | Separate retained/purge_pending/purged private-data state, deadline and versioned reopen/purge transition. Expired/purging cases return410 CASE_DETAILS_EXPIRED and require a newly entered report; erased details/media never return. | Reopen immediately before/at/after retention boundary and race purge. Require one valid winner and no access to retired images. |

All corrections were applied and read back by the coordinator. Section7 now names the three regression test families. No finding was dismissed, relabelled as an accepted risk or removed from the original report. No user risk acceptance is implied.

## Revision accounting

- Independently reviewed SHA256: `5d9b1b0348cafc4fb643eb04e510c76d00ade96079b315083be4a8d62e3e9b4d`.
- Final coordinator-corrected SHA256: `3aad1996a95d5f5e65597d45194ed5dc4db0d6965b65e979068e824ebae73575`.
- [Exact post-review changes](post-review.diff).
- The user requested one additional review agent; this run uses one review round. The corrected revision has **not** received a second independent review. Accordingly this is a completed design/review-and-correction package, **not** an independent clean approval of the final revision or a runtime readiness certificate.

## Remaining launch checks

Actual implementation/tests; genuine Facebook app/configuration and callback verification; GitHub/GCP/DNS and IAM setup; map-provider terms/quota; Gothenburg emergency contacts and policy content; mobile/accessibility/performance validation; real rollout/rollback and off-VM restore evidence. These are explicitly planned checks, not claimed completed operations.
