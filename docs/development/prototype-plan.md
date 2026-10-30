# Local prototype — community-care revision plan

Status: revised design accepted, implementation reviewed and local prototype running at http://127.0.0.1:4173. All30 API/runtime tests and6 browser tests passed; see the [validation record](community-care-validation.md) and [design review](community-care-design-review.md). The backed-up database cutover preserved the16 demo feeding records. Current authority is the [community-care revision](community-care-revision.md) plus the [production design](../designs/flock-design.md). Earlier validation applies to its recorded snapshot, not automatically to this revision.

## Goal

Update and restart the local Vue/Bootstrap + Express + real MongoDB prototype, replacing anonymous/private contribution flows and approved-helper roles with public activity and ordinary member care commitments. Feeding history shows display names and comments; care events join the same log. Any member can claim with a planned date, comment and resolve when authorized. Reports can be immediately resolved. Birds belong to public places, and browser geolocation proposes a new place for explicit confirmation.

## Sequence and parallel ownership

1. Revise canonical product/data/API/migration documents and shared contract. Keep old reviews as historical evidence.
2. Independent reviewer checks dated commitments, public-attribution/text migration, immediate-resolution atomicity, activity visibility, role/state authorization and geolocation consent/late-response handling. Resolve substantive findings before implementation.
3. After contract approval, backend and frontend implementation can run in parallel. Backend owns models/migrations, public projections, two-role actions, combined history and real-Mongo regressions. Frontend owns EN/SV public text, date/comment forms, combined log, immediate-resolution entry and geolocation states. Coordinator owns shared contracts and integration.
4. Update browser workflows for two ordinary members and moderator, new public behavior, immediate resolution and deterministic geolocation outcomes. Verify existing data migration/reseed behavior without resetting interactive contributions.
5. Inspect every contribution, rerun meaningful checks, fix discoveries in both contract and implementation, perform fresh implementation review, restart the owned API if needed and leave the local prototype ready.

## Local integration boundary

Origin http://127.0.0.1:4173 proxies Express on127.0.0.1:4300. MongoDB rs0 is authenticated on127.0.0.1:27018 with project-local persistent data and separate dev/test users. Local HTTP and simulated identities are permitted only for loopback fictional-data testing; production startup must refuse this mode. Keep credentials out of Vite filesystem exposure and Git. `npm run dev`, `dev:stop`, `dev:seed`, `typecheck`, `test`, `build` and `test:e2e` are the existing commands.

Shared DTOs/routes and migration rules are specified in [the revision](community-care-revision.md); root `packages/contracts` defines the implementation types after review. The prototype keeps current bounded responses (map100 default/max200; activity50 plus truthful hasMore). No production cursor/cluster or photo implementation is claimed. A second ordinary demo persona is a test identity, not a third role.

## Required validation

- Current display names and public comments visible without login; internal/provider identifiers and unapproved legacy private text/attribution withheld.
- Only member/moderator roles; any member can claim with planned date; competitor cannot steal/release/resolve another assignment; reporter/moderator exceptions are explicit.
- Ordinary comments do not change state; hidden/deleted parent or case suppresses all corresponding activity; care events never refresh feeding recency.
- Atomic immediate-resolved creation, idempotent replays and exactly one combined activity event; date validity and Stockholm-midnight checks after fence waits.
- Real MongoDB transactions, account/parent fences, CSRF/Origin, session tombstones, version conflicts and legacy-purged terminal guards.
- Idempotent migration/reseed with16 fictional feedings at the four named demo places; preserve arbitrary existing contributions and never relabel old private text as public.
- Browser workflows at390px/1440px, screenshots/overflow, geolocation granted/denied/unavailable/late response/manual edit, public-place confirmation and retained manual fallback.
- Typecheck/build; application health and persistent data after API restart; honest final report of tested scope.

## Still deferred

Real Facebook OAuth, image upload/storage, account export/erasure and full moderation administration, public GitHub/GCP/DNS deployment, production certificates/backups, and verified rescue-directory content. The new public-content model does not remove those later requirements or make the demo identities suitable for deployment.
