# Prototype scope and design validation ledger

The production design remains docs/designs/flock-design.md. This ledger distinguishes deliberate prototype boundaries from defects discovered during implementation.

## P0 — First local milestone boundary

Evidence: no application existed; Docker Desktop is stopped, native MongoDB7.0.31 arm64 is installed; the available Node binary reports25.8.1 (including the node@24 symlink).

Decision: use isolated native MongoDB on loopback27018, with replica set rs0, generated authentication and project-local persistent data. Use loopback HTTP4173 for the first testable milestone and clearly labelled local persona login. Do not weaken the eventual HTTPS/Facebook design: prototype startup must reject production mode and nonloopback origins. Recommend Node24 LTS for reproducible later builds; accept the installed Node25 for this local-only milestone and record the actual tested version.

Deferred, not advertised as implemented: actual Facebook OAuth, private photo storage, account export/erasure, production deployment/backup and complete moderation administration. The prototype UI must not expose misleading success buttons for these features. The full design's security/retention/recovery requirements remain future acceptance gates.

Validation completed: real Mongo authentication/transactions, loopback process bindings, production-mode refusal, CSRF and object authorization, persistent data and login across a full app/Mongo restart, and mobile/desktop browser workflows. See final verification below.

## Implementation-discovered design corrections

### D1 — Logout versus in-flight session persistence

Evidence: coordinator review of apps/api/src/session-store.ts found destroy deleting the session while set/touch can upsert it. The account remains active on logout, so an account write fence alone cannot stop a delayed touch from restoring the old session ID.

Correction: production design section5 now specifies per-session revocation tombstones and conditional set/touch writes. Backend implementation must reject writes to revoked IDs and retain their tombstone through the maximum session lifetime, while regenerating IDs for new logins.

Validation: the real-Mongo regression test captures session state, logs out, attempts a stale touch, and proves the old cookie remains anonymous; it passed in the final suite. Independent source review accepted the tombstone design. This is a design-contract correction, distinct from the P0 scope deferrals.

### D2 — Dependency and development-file exposure checks

Evidence: npm audit found advisories in the initially pinned Vue3.5.22, MapLibre5.9.0, Zod4.1.12 and Vite7.1.12. Patched compatible versions are Vue3.5.44, MapLibre6.16.0, Zod4.6.7 and Vite7.3.7. This is dependency maintenance under the design's supported/pinned-release rule, not a product architecture change.

Implementation hardening: Vite now explicitly denies .local/ and key/environment files, and allows only frontend/shared-code/dependency directories. Project-local credentials outside the web root must not become accessible through a development filesystem URL. A direct /@fs request for runtime.json returned403; npm audit reported zero known advisories across runtime and development dependencies. The independent reviewer accepted the filesystem restrictions on recheck.

### D3 — Moving time windows versus committed replays

Evidence: the reviewer found observation-time validation before the idempotency lookup. A valid committed feeding retried after crossing the seven-day boundary could return422 instead of its original result.

Correction: structural validation remains outside the transaction, while moving submission-time checks run only in a new-operation callback after replay lookup. Production design section4 now specifies this order. Current authorization and visibility still apply to replays.

Validation: real-Mongo regressions advance time across the boundary for both place-plus-feeding creation and direct feeding creation. Same-key/payload replay succeeds without duplication; a new key with the now-expired observation fails422. Independent review closed the finding.

### D4 — Authorization deadlines after database waits

Evidence: the reviewer found that a helper lease or retained-detail deadline could expire while a request waited at the reporter/parent fence, after its initial eligibility check.

Correction: recheck deadlines after those waits and include retained state, version, purge deadline and required assignment/lease in the conditional case mutation. New deadlines use this final authorization time. Production design section4 now specifies this requirement.

Validation: deterministic real-Mongo tests pause the parent fence and advance time. Expired reopen fails410; helper resolve/release fail409. Each case retains its prior state/version. Independent review closed the finding.

### D5 — Stale startup locks

Evidence: the reviewer found a check/delete race in automatic stale-lock recovery: concurrent contenders could remove a newly acquired lock based on an old ownership observation.

Correction: the local launcher fails closed on every existing lock. Manual recovery requires checking the owner identity and confirming no launch/stop operation is running. README documents this local operational rule; production deployment locking remains a separate requirement.

Validation: two runtime tests prove stale contenders cannot acquire/remove the existing lock, active locks exclude a contender, and normal owner release removes its own lock. Independent review closed the finding.

### D6 — Map failure feedback

Final visual QA found a generic map error could leave an inaccurate total-basemap failure warning after tiles had loaded. This was an implementation defect rather than a production architecture change. The frontend now tracks actual failed OSM tiles, removes recovered/offscreen failures, and distinguishes incomplete tiles from renderer startup failure. Coordinator browser checks loaded six mobile and twelve desktop tiles with no warning, then deliberately blocked tiles and verified the partial-map warning and usable place list. Restoring network access and reloading cleared the warning. Both full browser workflows passed again after this change; frontend typecheck/build also passed.

## Final verification — 30 October 2026

- Coordinator ran **23 passing API/runtime tests** against real MongoDB and **two passing browser workflows**, at390×844 and1440×1000. Tests cover transactions and rollback, retries, privacy projections, session revocation, account/parent fences, competing claims, deadline races and runtime locking. Expected injected-error logs occurred without failed tests.
- `npm run typecheck` and `npm run build` passed. Vite reports a large lazy MapLibre vendor chunk (approximately300kB gzip); performance has not been benchmarked or represented as production-qualified.
- Native MongoDB7.0.31 runs as authenticated rs0 on127.0.0.1:27018 with separate application/test users; API and Vite use loopback4300/4173. Actual tested Node version is25.8.1.
- A newly created place, its initial feeding and an authenticated session survived a complete `dev:stop` / `dev` cycle including MongoDB. The temporary verification records were removed precisely; application data was preserved. Services were left running.
- Browser workflows confirmed member reporting, anonymous privacy denial, helper private access only after claim, denial after release, language switching and no horizontal page overflow. Coordinator inspected mobile/desktop browse and mobile care-form screenshots. A separate live browser check successfully fetched six OpenStreetMap tiles; external tile availability is not guaranteed, so the list/manual-coordinate fallback remains available.
- The readiness endpoint returned200 against the real database. The sensitive Vite filesystem request returned403. Dependency audit reported zero known advisories; these checks do not replace a production security assessment.
- Fresh independent review accepted all four reported findings after correction, with no additional substantive issue in its focused recheck. That review inspected source/tests and did not rerun the coordinator's tests; see [review record](prototype-review.md).

## Additional bounded-scope details

This first prototype caps feeding/care histories at50 and map places at100 by default (up to200 with limit; hasMore is exposed). It does not implement production cursors/clusters, claim renewal/observe, scheduled physical purging, or HTTP moderation/role administration. Private-detail retention deadlines are enforced at read/reopen time; lifecycle workers remain required before any real-data deployment. Local API tests manipulate isolated fixtures to validate hidden/revoked/purged states; those fixtures are not a user-facing moderation implementation.

## Requested demo locations and feeding histories

The user selected Coop Eriksberg, Vårväderstorget, Friskväderstorget and Järntorget. Seeds now use approximate public landmark coordinates (sources in README), with four fictional feeding records per place. A guarded migration replaces only the original placeholder places and unchanged sample care coordinates; added contributions and workflow states are preserved. Stable feeding IDs and insert-only writes prevent duplicate history or timestamp resets when seeding again.

The wider geographic spread exposed an implementation defect: relative positioning overrode MapLibre's absolute marker positioning, displacing later markers vertically. Markers now use absolute positioning, and the initial viewport fits the loaded places with room for the mobile detail sheet. This corrects rendering to the existing design contract; it does not change the privacy or architecture design.

Verification: all23 API/runtime tests, both browser workflows, typecheck and build pass. Direct database comparison confirmed existing contributions were preserved and all16 fixture feedings remained byte-for-byte unchanged after another seed. Browser geometry checks and visual inspection confirmed all four pins fit at390px and1440px, including above the mobile sheet. The running local database contains the new demo data.
