# Community-care design — independent review

Status: accepted for implementation after correction and recheck. This is a design review, not evidence that the revised application is implemented or that its tests pass.

## Scope and method

A separate reviewer inspected the revised [community-care contract](community-care-revision.md), [integrated production design](../designs/flock-design.md), brief, decisions, design README and prototype plan. The author and reviewer were different agents. The reviewer checked public attribution/comments, two-role authorization, planned-date semantics, combined activity, immediate resolution, location simplification, migration and geolocation consent/races. Historical specialist/review snapshots were not rewritten or treated as acceptance of this revision.

The review was read-only document inspection. It did not execute the application, database migration, tests, browser permission flow, Facebook or deployment.

## Initial substantive findings

| Finding | Problem in the initial revised design | Correction |
| --- | --- | --- |
| C1 — Legacy terminal states | Protecting only already-purged cases could revive a purge-pending case or retained details whose deadline had expired before physical cleanup. | Record one cutover time. Preserve purged, purge_pending and retained-with-purgeDueAt-at/before-cutover as terminal. Never resurrect erased or already-expired content. Future-deadline retained cases can migrate while withholding old private text. |
| C2 — Old-writer cutover | A new lifecycle marker cannot stop an unmodified old API or purge worker from writing the old shape or processing a converted case. | Quiesce all old API writers/purge workers before guarded/transactional migration. Gate revised API startup on the migration version. New workers reject obsolete lifecycle actions. Do not roll back to an old binary without an independently reviewed compatibility plan. |
| C3 — Location confirmation | A coordinate change or late GPS response could move a pin after the person confirmed its public location. | Clear publicLocationConfirmed after every coordinate change. Manual edits, form replacement/close and confirmation invalidate pending GPS callbacks. Require confirmation of the final coordinate before submission. |

The author applied each correction to both the revision contract and integrated design. Minor stale terminology was also removed: care-point validation now applies only to places, participant access became restricted administrative access, and participant-view cache wording became account/capability state.

## Recheck and disposition

The independent reviewer re-read the corrected contracts and accepted the design for implementation; all three substantive findings were closed. The coordinator then authorized backend/frontend work against the frozen contract. The record preserves the initial issues and their corrections rather than rewriting the review as if they were never present.

Implementation must still prove these contracts through migration, real-Mongo authorization/transaction tests and browser tests, including legacy expiry/purge states, stopped old writers, idempotent reruns, Stockholm-midnight date revalidation, public-name/comment publication eligibility, immediate-resolution event uniqueness, hidden activity suppression and geolocation confirmation reset/late callbacks. Any implementation-discovered design issue must be corrected and revalidated before final acceptance.

## Implementation-discovered design correction C4

During implementation review, the independent reviewer found a cached-client publication gap. An old feeding form with no private note could still submit a body accepted by the new server, using a valid old session and CSRF token, even though its displayed policy promised anonymous attribution. Quiescing old servers does not close existing browser tabs.

The coordinator amended both canonical contracts to require `X-Flock-Contract: community-care-v2` for contribution mutations. Missing or mismatched markers return409 `CLIENT_UPDATE_REQUIRED` before replay or mutation. Authentication/logout stay usable, and normal session/CSRF/role checks remain required. The marker is a compatibility acknowledgement rather than a secret. The frontend sends it with the new public-policy forms and provides a reload instruction on incompatibility.

The independent reviewer re-read and accepted this design correction before its code guard was implemented. Regression validation must prove that an otherwise valid old client cannot create a publicly attributed feeding, while the new contract can. Final execution and implementation-review evidence belongs in [the validation record](community-care-validation.md).
