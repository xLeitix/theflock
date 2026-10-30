# Backend and data architecture proposal

> Historical proposal: the current [integrated design](../flock-design.md) and [community-care revision](../../development/community-care-revision.md) supersede anonymous attribution, private contribution notes, approved-helper roles and separate bird coordinates below. This snapshot is retained as earlier design evidence.

Status: advisory design; integrated design decides conflicts. No application or infrastructure implemented.
Authority: `brief.md`, mockup inventory, and parent integration decisions supplied during this review.
Latest requirements: MongoDB on the same Google Cloud VM; no Atlas; one optional private care photo in v1.
Provider capabilities, quotas, supported versions, and deployment configuration require the main design's verification.

## 1. Runtime and ownership

- Caddy terminates HTTPS for `theflock.icet-lab.eu`; same-origin Express serves Vue assets, `/api/v1`, and `/auth`.
- Express owns validation, authorization, DTO construction, transactions, photo access, and domain transitions.
- Route handlers call application services; services call repositories; repositories never supply HTTP responses directly.
- Use one MongoDB driver/client pool per application process; start with a maximum of 20 connections and measure.
- Run a pinned, supported MongoDB release as a private **single-node replica set** on persistent VM storage.
- Transactions are needed for place-plus-feeding, derived summaries, moderation, and durable idempotency records.
- Require authenticated application and maintenance identities; bind MongoDB only to private container/network interfaces.
- Use database TLS and least-privilege application credentials; migration/backup credentials have separate responsibilities.
- Configure transaction read concern `snapshot` and commit write concern `majority` with journaling; verify effective settings.
- On one replica-set member, majority still means one machine: there is no failover or protection against VM/disk loss.
- Keep media in private GCS objects and encrypted, tested database backups off the VM; backups are not live replicas.
- Budget MongoDB cache explicitly, initially around 25% of host RAM; reserve memory for Express, OS, and image processing.
- Initial limits: one image transform at a time, request-body limits, database `maxTimeMS`, bounded worker batches.
- Final VM sizing follows a realistic fixture/load test; the proposal makes no throughput or availability claim.
- One maintenance worker in the app deployment handles expiry, cleanup, and summary repair; each job is idempotent.
- Use a database lease if two app generations can overlap during deployment; jobs must tolerate lease loss/restarts.
- No messaging, push, background location collection, or offline mutation queue in v1.

## 2. Shared conventions

- MongoDB `_id` values remain internal ObjectIds; APIs expose their validated hexadecimal representation as opaque `id`.
- All persisted instants are BSON Dates in UTC; JSON uses ISO 8601 UTC strings. Locale formatting belongs to Vue.
- Every mutable aggregate has `version`, `createdAt`, and `updatedAt`; versions increment only on committed changes.
- Server creates ownership, roles, moderation fields, timestamps, counters, and storage references; reject those in input.
- Validate DTOs with strict allowlisted schemas and reject unknown fields; never pass request objects to Mongo queries.
- Apply MongoDB collection validators as a second boundary; migrations update validators and indexes explicitly.
- Notes are plain text, normalized and trimmed; never accept HTML, executable Markdown, or arbitrary query operators.
- Coordinates are GeoJSON `Point` values in `[longitude, latitude]` order, with finite values and legal ranges.
- Deployment config supplies a supported geographic region; validate place creation against it without inventing a city.
- Suggested limits: place name 2–100 characters; place description 500; feeding note 1,000; case description 2,000.
- Allow EN/SV interface preferences only in v1; user-authored content retains its original language.

## 3. Collections and invariants

### `users` and `sessions`

- `users`: `_id`, `facebookSubject`, private `displayName`, `locale`, `roles`, `status`, policy acknowledgements, timestamps.
- Roles are `member`, `approved_helper`, and `moderator`; moderator grants/revocations are audited server-side operations.
- Store no Facebook access token after login unless a separately justified provider requirement demands it.
- Email and Facebook profile photo are unnecessary in v1; avoid importing them merely because the mockup shows them.
- Status is `active | suspended | deletion_pending | deleted`; authorization checks current status on each mutation.
- Unique index on `facebookSubject` while it exists; deleted accounts remove this field rather than sharing a null value.
- `sessions`: opaque session reference, user ID, creation/last-use/absolute-expiry instants, minimal authentication metadata.
- Unique session reference and TTL index on `expiresAt`; expired sessions are rejected by application time checks.
- TTL cleanup is asynchronous and never determines whether access remains authorized.

### `places`

- Fields: `name`, public `description`, normalized `nameSearch`, public `location`, `createdBy`, moderation state, version.
- Public description has an explicit publication preview; it must describe the location rather than a person's routine.
- Derived fields: `lastPublicFeedingAt`, `lastPublicFeedingId`, `lastPublicFlockSize`, `unresolvedCareCount`.
- `lastPublicFlockSize` means the size in the latest visible feeding, not a scientifically established usual population.
- `createdBy` is private; it does not give the creator ownership of all later community contributions.
- Place moderation state is `visible | hidden | deleted`; hidden places are absent from public reads and reject new activity.
- Indexes: `location: 2dsphere`; `{moderationState:1,nameSearch:1,_id:1}`; `{createdBy:1,createdAt:-1}`.
- Creation carries immutable `clientRequestId` and canonical request digest, unique with `createdBy` for deduplication.
- Nearby duplicate detection is advisory: suggest existing places within 30 m, but allow distinct named spots explicitly.
- Moderators merge duplicates using a dedicated repair operation; v1 need not expose a general merge UI.

### `feedings`

- Fields: `placeId`, private `actorId`, `occurredAt`, server `createdAt`, `effectiveOccurredAt`, `flockSize`, `foodTypes`, `note`.
- `flockSize` is `small | medium | large`: fewer than 15, 15–50 inclusive, and more than 50 birds respectively.
- `foodTypes` contains 1–4 distinct values from `grain_mix | seeds | dried_peas | other`; exact enum translation is shared.
- All visible feedings publish anonymous activity; there is no separate private-feeding mode in v1.
- Feeding `note` is private to its author and moderators; public histories never include it or author identifiers.
- Other fields: `moderationState`, version, immutable `clientRequestId`, request digest, `updatedAt`, optional `deletedAt`.
- Indexes: `{placeId:1,moderationState:1,effectiveOccurredAt:-1,_id:-1}` and `{actorId:1,createdAt:-1,_id:-1}`.
- Unique `{actorId:1,clientRequestId:1}`; preserve this identity while the contribution or its retry tombstone exists.

### `careReports`

- Fields: `placeId`, private `reporterId`, private `exactLocation`, `issueTypes`, `urgency`, `birdCount`, private `description`.
- Categories are bounded enums, initially `entangled | injured | sick | immobile | other`; urgency is `now | today`.
- Validate `birdCount` as integer 1–1,000; exact position must be inside the supported region and near its chosen place.
- Proposed near-place limit: 1 km, with UI prompting a better place if exceeded; this is product policy, not GPS truth.
- `reporterStaying` records a time-limited statement with `stayingConfirmedAt`; never expose a persistent attendance claim.
- Lifecycle: `open | claimed | resolved | withdrawn`; moderation visibility is a separate `visible | hidden | deleted` field.
- Fields include `lastObservedAt`, `assignedHelperId`, `claimExpiresAt`, `resolvedAt`, `resolutionCode`, version, timestamps.
- A bounded `photo` subdocument holds upload ID, state, object key/generation, media metadata, and expiry/cleanup times.
- Indexes: `{placeId:1,moderationState:1,state:1,createdAt:-1}`, `{reporterId:1,createdAt:-1}`, `{assignedHelperId:1,state:1}`.
- Maintenance indexes: `{state:1,claimExpiresAt:1}` and `{'photo.state':1,'photo.startedAt':1}`.
- Unique `{reporterId:1,clientRequestId:1}`; no public geospatial index or API over private exact positions.

### `careEvents`, `operations`, `auditEvents`, `deletionJobs`

- `careEvents` is append-only structured history: report ID, event type, private actor ID, timestamp, private note, version.
- Event types include `observed`, `claimed`, `released`, `claim_expired`, `resolved`, `reopened`, and `withdrawn`.
- Index `{reportId:1,createdAt:1,_id:1}`; keep events separate so one long-lived case cannot grow a document without bound.
- `operations` stores actor, route operation, idempotency key, canonical digest, committed outcome IDs/status, expiry.
- Unique `{actorId:1,operation:1,key:1}` and TTL `expiresAt`; outcomes contain no private descriptions, photos, or coordinates.
- `auditEvents` records role/visibility/deletion actions and reason codes without copying deleted personal content.
- `deletionJobs` records resumable, minimal cleanup steps for database records, objects, and aggregate repairs.
- `contentReports` stores reporter, target kind/ID, bounded reason, private note, triage state, and timestamps; index state/createdAt.
- `emergencyDirectory` may be a versioned reviewed JSON deployment artifact rather than a collection in v1.
- Directory records require locality, contact data, provenance, `verifiedAt`, and reviewer; no unverified placeholder is published.

## 4. Public and private DTO contracts

| DTO | Allowed fields | Explicitly excluded |
| --- | --- | --- |
| `PlaceSummary` | id, name, public location, recency, latest flock, unresolved-care count | creator, user location, private notes |
| `PlaceDetail` | summary plus public place description | internal flags, credentials, ownership |
| `PublicFeeding` | id, placeId, effective occurrence time, flockSize, foodTypes | actorId/name/avatar, note, clientRequestId |
| `OwnFeeding` | public fields plus own note, submitted time, version | other users' private data |
| `PublicCareSummary` | id, placeId, category, urgency, state, stale flag, reported/last-observed time | exactLocation, description, staying flag, photo, identities |
| `AuthorizedCareDetail` | summary plus exactLocation, description, birdCount, authorized photo descriptor, structured events | Facebook identity, helper roster, storage keys |
| `Me` | own displayName, locale, capabilities, account state | provider tokens, other users, full session internals |

- Construct DTOs explicitly; a database projection helps efficiency but is not the authorization boundary.
- Public care summaries identify an existing public place; this is place-level disclosure, not guaranteed location anonymity.
- Explain that disclosure when submitting; precise position and descriptive/photo details remain access-controlled.
- Precise access: reporter, moderator, or the **currently assigned approved helper with an unexpired claim**.
- Ordinary login cannot self-claim private access; helper approval is a moderator-granted capability, with an audited revocation.
- Do not reveal Facebook identities to helpers; case descriptions and photos may still contain personal information.
- Private responses use `Cache-Control: private, no-store`; no service-worker or CDN cache for authenticated detail/media.
- Public reads also use no-store initially to avoid stale moderation/deletion exposure; optimize only with explicit invalidation.

## 5. Canonical HTTP interface

All data endpoints below have `/api/v1` prefix; JSON errors use `{error:{code,message,requestId,details?}}`.
Unknown/non-readable private resources return 404; use 401 for absent session, 403 for a known missing capability.

| Method and path | Authentication and behavior |
| --- | --- |
| `GET /session` | Public; current authentication state and CSRF bootstrap; no user data when anonymous |
| `GET /me`, `PATCH /me` | Member; own settings only, version precondition for updates |
| `POST /me/deletion` | Member; schedule idempotent erasure and immediately revoke sessions |
| `GET /places?bbox=...&zoom=...` | Public; bounded map DTOs/clusters and coverage metadata |
| `GET /places/search?q=...&bbox=...` | Public; normalized bounded prefix search, at most 20 results |
| `GET /places/:id` | Public visible place detail |
| `POST /places` | Member; create place and optional `initialFeeding` in one transaction |
| `GET /places/:id/feedings?cursor=...` | Public anonymous, visible history |
| `POST /places/:id/feedings` | Member; create a feeding and update place summary atomically |
| `GET /me/feedings?cursor=...` | Member; own records, including private notes |
| `PATCH /feedings/:id`, `DELETE /feedings/:id` | Author/moderator; update allowed fields or suppress record, repair summary |
| `GET /places/:id/care-reports?cursor=...` | Public redacted reports for one visible place |
| `POST /care-reports` | Member; submit report attached to an existing visible place |
| `GET /care-reports/:id` | Public summary only, independent of session state |
| `GET /care-reports/:id/private` | Reporter/moderator/current approved assigned helper; private detail |
| `POST /care-reports/:id/claim` | Approved helper; compare-and-set exclusive claim |
| `POST /care-reports/:id/release` | Assigned helper/moderator; release claim |
| `POST /care-reports/:id/observations` | Reporter/assigned helper/moderator; structured current observation |
| `POST /care-reports/:id/resolve` | Reporter/assigned helper/moderator; resolution reason required |
| `POST /care-reports/:id/reopen` | Reporter/moderator; reopen with current observation |
| `POST /care-reports/:id/withdraw` | Reporter/moderator; remove from public activity and revoke helper access |
| `PUT /care-reports/:id/photo`, `DELETE /care-reports/:id/photo` | Reporter/moderator; bounded upload or removal |
| `GET /care-reports/:id/photo` | Exact same private-detail ACL; authenticated byte stream |
| `GET /emergency-directory?locale=en` | Public reviewed regional directory with verification dates |
| `POST /content-reports` | Member; report content for moderation; no content exposed in response |
| `PATCH /moderation/:kind/:id` | Moderator; allowlisted resource kind and visibility action plus audit reason |
| `POST /moderation/users/:id/helper-approval` | Moderator; grant/revoke helper capability with reason |

- `GET /auth/facebook`, `GET /auth/facebook/callback`, and `POST /auth/logout` are same-origin server-session routes.
- OAuth state/return intent is server-bound and allowlisted; completing login never submits a feeding without confirmation.
- Mutations require CSRF protection, origin validation, current account authorization, and `Idempotency-Key`.
- Existing mutable aggregates also require `If-Match: "<version>"`; missing precondition is 428, obsolete version is 412.
- Cursor histories default to 20, maximum 100; cursor encodes the last indexed sort tuple and is schema-validated.
- Include `serverTime`, resource `version`, and action capabilities in applicable private detail responses.

## 6. Bounded map and search queries

- Require finite `west,south,east,north`, legal coordinate ranges, ordered corners, and integer `zoom` in an allowed range.
- V1 rejects antimeridian-crossing boxes; normalize wrapping in the UI before requesting an ordinary regional viewport.
- Proposed limits: viewport area at most 2,500 km², at most 5,000 candidate places, 500 returned pins, 200 clusters.
- Query visible places through `$geoWithin` and the 2dsphere index; use an explicit public projection and `limit(5001)`.
- Set database time and request deadlines; if candidate count or time budget is exceeded, return a zoom-in error.
- Never truncate silently or compute global totals from an incomplete viewport result.
- For bounded candidate sets, cluster projected coordinates into stable zoom/grid cells; return counts and aggregate statuses.
- At detailed zoom, if more than 500 pins remain, cluster further or require zooming; do not emit thousands of markers.
- Response states `coverage: complete`, requested bounds, server time, query zoom, and exact counts for those bounds only.
- Counts are places: recency buckets are mutually exclusive; care is an independent flag and can overlap any bucket.
- Search uses escaped, case-sensitive prefix matching against normalized names and the supported region/bounds.
- Never accept client regex, arbitrary field sorting, Mongo operators, or unbounded whole-world searches.
- Public query quotas protect availability, not secrecy: public sightings should be assumed scrapeable.

## 7. Feeding time, atomic creation, and retries

- Accept optional `occurredAt`; omission means server now. Allow the previous seven days and at most five minutes ahead.
- Preserve submitted `occurredAt`, but use `effectiveOccurredAt = min(occurredAt, createdAt)` for recency and ordering.
- The future allowance tolerates clock skew; it must not extend freshness beyond the moment the server accepted a record.
- Compute elapsed UTC duration at read time: `<=48h` recently fed; `>48h && <=96h` due soon; `>96h` needs feeding.
- No visible feeding means `unknown`, never hungry by default; size is unknown when no qualifying feeding exists.
- Recency is an observation heuristic, not proof of animal hunger. The UI should say “Needs feeding” rather than assert hunger.
- Older backdated entries never replace a newer latest summary; break equal-time ties deterministically with `_id`.
- `POST /places` validates the complete request, then inserts place, optional feeding, summary, and operation result together.
- Never create a place successfully while silently losing its requested initial feeding; validation failure commits neither.
- Every feeding insertion/edit/hide/delete transaction also writes the affected place's version/summary, forcing serialization.
- Recompute the latest visible feeding with the indexed ordering after edits or removals; avoid an irreparable `$max`-only cache.
- Idempotency key is a client UUID generated once per submission; retries reuse it and exactly the same canonical payload.
- Insert the operation result in the same transaction as domain writes; concurrent duplicate keys replay the committed outcome.
- Reusing a key for a different payload returns 409; use bounded driver retries for transient transaction/commit uncertainty.
- Retain operation results seven days; immutable creation keys on resources protect later create retries while records exist.
- Reauthorize replayed outcomes and rebuild permitted DTOs; an old response must not restore revoked private access.
- If final commit outcome cannot be established within the request deadline, return retryable uncertainty, never false success.
- Vue may retain the in-flight key until resolved, but must not schedule automatic background/offline mutation delivery.

## 8. Care lifecycle and simultaneous helpers

- Creation sets `open`; public summaries show no helper identity. Claims require current approved-helper status.
- Claim uses one conditional update on report ID, expected version, visible state, and absence of a valid competing claim.
- Commit claim, structured event, operation outcome, and any place summary update in one transaction.
- Exactly one racing claim succeeds; stale versions receive 412, otherwise an occupied case returns 409 `ALREADY_CLAIMED`.
- Proposed claim lease is two hours; the assigned helper can renew it through a current structured observation.
- A retry with the same operation key replays its outcome; it must not extend the lease a second time.
- Release or lease expiry returns `claimed → open`, clears helper assignment, and immediately removes private-detail access.
- Enforce lease expiry in authorization/read logic even if the cleanup worker has not yet persisted the transition.
- `open/claimed → resolved` requires a reason such as `rescued | no_longer_found | recovered | duplicate | other`.
- `resolved → open` requires a reporter/moderator's fresh observation; `open/claimed/resolved → withdrawn` hides the report.
- Hidden or withdrawn reports permit reporter/moderator access only; revoked/suspended helpers lose access immediately.
- “Unconfirmed” is a derived flag after 24 hours without observation, not a claim that the bird is safe or still present.
- `unresolvedCareCount` includes visible open/claimed reports, including unconfirmed ones; explicit resolution removes them.
- Update and validate `reporterStaying` freshness separately; suppress it after 30 minutes unless explicitly reconfirmed.
- Check current role/status during conditional transactions; role revocation and claim must share an authorization fence write.
- Role/account changes also revoke affected sessions/claims; this closes a read-authorize-write race across concurrent requests.

## 9. One private photo: staged storage and cleanup

- Creating a case succeeds without a photo; upload is a separate step and photo failure never discards the report.
- Before receiving bytes, authorize reporter/moderator and reserve `photo.uploadId`, random object key, state, and deadline.
- Allow one slot per report; versioned compare-and-set prevents concurrent uploads from replacing one another silently.
- Accept JPEG/PNG/WebP only; maximum 10 MB input and 20 megapixels; reject animation, malformed files, and MIME mismatch.
- Stream into a protected temporary file with byte limits; inspect dimensions before bounded decoding and re-encoding.
- Normalize orientation, strip EXIF/metadata, resize longest dimension to 1,600 pixels, and enforce a bounded output size.
- Run transforms with a concurrency/memory/time budget; delete local originals promptly on both success and failure.
- Upload only normalized bytes to a private GCS key using server credentials; accept no user-supplied URL or storage path.
- Store exact object generation/checksum/content metadata; finalize `uploading → ready` only if report and reservation remain valid.
- GCS upload and Mongo commit are not atomic: failed finalization queues object deletion, and worker retries until confirmed.
- Expire abandoned reservations after one hour; daily cleanup finds obsolete reserved/unreferenced objects older than 24 hours.
- Authorize every download before streaming; do not issue public or persistent bearer URLs; return no-store and nosniff headers.
- Removing/withdrawing/hiding/deleting a report immediately blocks helper/media access according to the same case ACL.
- Photo removal marks `delete_pending` first, then deletes the exact generation; never claim erasure merely from a queued job.
- Upload idempotency hashes normalized request metadata plus received file bytes before comparing/replaying committed outcomes.
- Backups/restore procedures preserve media metadata consistency and reapply deletion records before restored access opens.

## 10. Moderation, retention, migration, and acceptance

- Proposed retention values need policy approval before launch: feedings 12 months; terminal case private data/photos 30 days.
- Unresolved reports cannot retain sensitive data forever: after 90 days without observation, hide and schedule erasure.
- Account deletion revokes access immediately; erase provider/profile links and contributed private notes/positions/media within 30 days.
- Public place records may remain as community data; remove author links and delete that user's feeding activity, then recompute recency.
- Preserve minimal abuse/security audit metadata for 90 days; no notes/photos/provider tokens in logs or audit snapshots.
- Proposed off-VM backup window is 30 days; deleted content ages out with backup expiry and cannot become live on restore.
- Keep a minimal erasure ledger outside ordinary backup rollback for at least the backup window plus recovery margin.
- Soft deletion makes data unavailable immediately; a resumable purge performs erasure and reports failures for operator action.
- No destructive TTL index on contributions that require aggregate repair, object deletion, or evidence of completed erasure.
- Deployment migrations are explicit and backward-compatible across rollback; app refuses readiness on incompatible schema/index state.
- Required tests: real replica-set transactions, failed initial-feeding rollback, duplicate/reordered retries, and ambiguous commit retry.
- Test exact 48h/96h boundaries, future clamping, backdating, unknown status, and latest-summary repair after edit/hide/delete.
- Race two helpers; assert one owner; test expired claims, concurrent role revocation, object-level ACLs, and idempotent renewals.
- Test public DTO deny-lists, private cache headers, malicious query objects, viewport density/time limits, and cursor validation.
- Test malformed/oversized photo input, failed object upload/finalization, concurrent deletion, and cleanup after process termination.
- Exercise database/media restore plus erasure replay and run summary reconciliation; passing unit tests alone is insufficient.
