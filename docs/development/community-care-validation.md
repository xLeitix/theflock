# Community-care implementation validation

Status: local implementation complete and validated. The [design review](community-care-design-review.md) accepted the revised contract before application code changed; this record separates that review from execution evidence. Repository CI/CD validation is recorded separately in [the pipeline notes](ci-cd.md).

## Cutover preparation

The coordinator stopped the owned legacy API and Vite through `npm run dev:stop`, restarted only MongoDB with `dev:setup`, and confirmed that neither old HTTP listener answered. A private EJSON snapshot was written to `.local/backups/before-community-care-2026-10-30T22-18-16.760Z.json` with mode0600. It contains4 places,16 feedings,3 care cases,4 users,0 care events,0 idempotency receipts and37 sessions. This is a local pre-cutover snapshot, not a tested production backup/restore system. No application writes occurred between quiescence and the snapshot.

## Implementation ownership

Backend and frontend agents work in parallel against the frozen shared contract. The coordinator owns browser tests, runtime integration, documentation and verification of the actual local migration. A separate reviewer inspects the implementation against the accepted design, without running mutations against the interactive database.

## Required execution evidence

- API/runtime tests against isolated authenticated `flock_test`: role/object authorization, public text/name projections, hidden activity, planned-date races/replays, immediate resolution, atomicity, migration and session safeguards.
- Browser workflows at390px and1440px: named public feeding/comments, two ordinary member identities, planned care, standalone comment, resolution and immediate resolution, anonymous combined history, EN/SV and overflow.
- Deterministic browser location checks: granted coordinates, permission denial, unavailable/timeout fallback, late callback/manual edit/form replacement/confirmation protection. These simulate browser location results, not a physical-device GPS measurement.
- Coordinator inspection of public DTOs, migration preservation/rerun, screenshots, typecheck/build, readiness and persistent local process.
- Independent implementation findings corrected and rechecked before completion.

## Executed results

The coordinator independently ran all30 API/runtime tests and all6 browser tests successfully. The API tests cover the public DTOs, two-role authorization, competing member claims, public comment events, current-name/deleted-name projections, state/visibility fencing, immediate-resolution commit/rollback/replay, hidden-case filtering before activity limits, date checks across Stockholm midnight, session revocation, schema gating and legacy migration. Injected transaction/session errors produced expected diagnostic logs without failed tests. Frontend typecheck and build passed; the existing lazy MapLibre bundle warning remains (about300kB gzip), without a production performance claim.

The two complete browser workflows ran at390×844 and1440×1000. They used Alex and Sam as ordinary members, published a feeding comment and care description, claimed with a date, added a standalone comment, resolved with an outcome comment, and created an immediately resolved report. Anonymous API/UI reads after logout/reload showed both activity types, correct actor names and public comments. HTML-like comment text stayed text. Three location-failure tests confirmed denial/unavailable/timeout still allow manual place creation. A fourth location test proved that late callbacks cannot overwrite a manual edit, a confirmed pin or a replacement form; moving the coordinate clears confirmation. Screenshots of mobile and desktop activity were inspected. Geolocation responses were simulated browser inputs; no physical GPS accuracy was claimed.

Before the real cutover, a temporary listener on127.0.0.1:4300 proved the seed CLI refuses migration even with the explicit cutover flag, without writing a migration marker. With the listener removed and the old app stopped, `FLOCK_ALLOW_COMMUNITY_CUTOVER=1 npm run dev:seed` succeeded. The local database retains4 places,16 feedings and3 care cases, with3 synthetic care events. Direct comparison with the pre-cutover snapshot proved all feeding IDs, place/author references, food/flock values, visibility and original observation/creation times survived. Public fixture fields were added deliberately; obsolete bird coordinates and old assignments were removed. Every account has only member/moderator role values. Another seed left places, feedings, cases, events and users unchanged.

The coordinator started the new API/Vite against the migrated database using `npm run dev`. Readiness succeeded and the six browser workflows exercised that persistent process; their temporary records were cleaned by exact IDs. The app is left running at http://127.0.0.1:4173.

## Independent implementation review

The independent reviewer accepted the implementation source with no remaining substantive findings. Its one implementation-discovered design issue, C4, was corrected and revalidated before the compatibility guard was added: old cached anonymous forms now receive409 `CLIENT_UPDATE_REQUIRED` unless they carry the new contribution contract. A real-Mongo regression uses an otherwise valid session/CSRF to prove old or mismatched markers cannot publish, while the current marker succeeds.

Reviewed source SHA-256 prefixes: app `51a61fd8bf7124b8`, migrations `6f2285c3f0a02a4c`, projections `d7b34ecbd268cf15`, API tests `2fa47eeda7063810`, App.vue `ce93b2ecb5e01911`, frontend API client `abada9b9aea863ce`, shared contracts `9ff06052862d7333`. The review was source inspection; executed checks above belong to the coordinator. Local listener detection does not claim to discover arbitrary external workers; production operators must quiesce all old writers explicitly.

Real Facebook, photos, cloud hosting deployment, complete moderation/export/deletion administration and production TLS/backup validation remain outside this local milestone. CI is a separate deliverable and is not evidence that a production deployment occurred.
