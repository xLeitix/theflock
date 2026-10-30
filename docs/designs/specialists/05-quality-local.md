# Flock quality, local development and release acceptance

> Historical proposal: the current [integrated design](../flock-design.md) and [community-care revision](../../development/community-care-revision.md) supersede anonymous attribution, private contribution notes, approved-helper roles and separate bird coordinates below. This snapshot is retained as earlier design evidence.

Status: specialist design proposal, 30 October 2026; no application, test execution, provisioning or deployment is claimed.
Scope: mobile-first Vue/Bootstrap, Express, same-VM MongoDB, Facebook authentication, public sightings/private care media, and no messaging.
This proposal follows the integrated draft's canonical `/api/v1/care-cases` routes; conflicting specialist routes must not become duplicate APIs.
Provider evidence and the unresolved Meta verification gap are recorded in [provider-evidence.md](../provider-evidence.md).

## 1. Decisions required before implementation

- Resolve the release-image contradiction: fake adapters cannot both be excluded from the production image and selected inside that image for CI.
- Use source-only local adapters for rapid development; test the unchanged release image with production clients against external protocol doubles in an isolated CI network.
- Keep the real-provider acceptance record separate: protocol doubles cannot establish Facebook approval, GCS IAM, real DNS, certificate issuance or VM recovery.
- Use the integrated draft's retention values as provisional test configuration; specialist proposals differ on 24-hour/30-day erasure and 30/90-day care retention.
- Follow the revised integrated public contract: UTC calendar dates and server recency labels; exact feeding timestamps remain private, and public IDs are random UUIDs.
- Public pagination uses authenticated-encrypted, query/scope-bound 15-minute cursors; decoding an ID/cursor must not recover private timestamps or contributor identity.
- The revised care contract adopts a two-hour renewable claim lease; test expiry on access before worker cleanup, explicit observation renewal and private staying-flag expiry.
- Fix the resource budget before launch: blue/green apps, MongoDB, image decoding and a backup run can overlap on the proposed 2-vCPU/8-GiB VM.
- Record all these decisions in contracts and fixture expectations before teams implement incompatible assumptions.

## 2. Two supported development modes

- Default host mode runs pinned Node, Vite and Express on macOS, with MongoDB and provider doubles in Docker Compose; no GCP/Facebook account is needed.
- Container-only mode runs the same commands inside a development container and shares the Compose network; it requires Docker/Compose but no host Node toolchain.
- Publish `.node-version`, `engines`, exact package-manager version, lockfile, Compose plugin minimum and supported Docker runtime versions during scaffolding.
- Select and verify supported multiarchitecture Node/Mongo images for Intel `amd64` and Apple Silicon `arm64`; pin reviewed manifest digests, not mutable `latest` tags.
- `dev:doctor` checks architecture, Docker daemon, Compose, available ports/disk, CPU support required by the chosen Mongo version, and Node compatibility without changing files.
- A supported native Apple Silicon image is the default; do not silently emulate `amd64`, downgrade MongoDB, or mistake an emulator-only pass for native support.
- Record clean-checkout setup on one Intel Mac and one Apple Silicon Mac before the first developer milestone; Linux CI does not prove either macOS workflow.
- Keep local credentials, generated CA keys, uploads, traces and Compose state under ignored `.local/`; example files contain names and placeholders only.
- Bind published developer services to `127.0.0.1`; an optional physical-phone workflow uses an explicitly configured private test network and synthetic data.
- Default browser origin is `https://localhost:8443`, through a local TLS proxy to Vite/API; production-style Secure cookies and same-origin CSRF remain testable.
- Setup creates a local CA but does not silently install a system trust root; document an explicit trust action and removal procedure, with CI using a disposable trust store.
- Hot reload and API/auth requests use that same origin; allowlisted WebSocket upgrade is development-only and absent from the production CSP/proxy configuration.

## 3. Local MongoDB bootstrap, TLS and discovery

- Use one authenticated replica set `rs0`, a named persistent data volume and a private `mongo` network alias; standalone Mongo is not a valid test substitute.
- Server certificate SANs cover `mongo`, `localhost`, and IP `127.0.0.1`; generate a local CA, matching server key/certificate and random membership keyfile.
- Local membership uses keyfile authentication; every client connection still verifies server TLS and authenticates with separate SCRAM-SHA-256 credentials.
- SCRAM clients need no client certificate: explicitly allow TLS connections without client certificates while requiring TLS and SCRAM authorization; never disable server verification.
- Host connection is `mongodb://localhost:27017/flock_dev?replicaSet=rs0&directConnection=true&authSource=admin&tls=true`, with credentials/CA supplied separately.
- The development-only direct connection avoids discovery of the container-only `mongo` hostname; it still connects to a replica-set primary and supports transactions.
- Container clients use `mongodb://mongo:27017/flock_dev?replicaSet=rs0&authSource=admin&tls=true`, validate `mongo`, and exercise normal topology discovery.
- Publish Mongo only as `127.0.0.1:27017:27017` in host mode; container-only mode publishes no Mongo port; production never inherits this override.
- Bootstrap starts `mongod` with `requireTLS`, keyfile and replica-set configuration; an init job executes `mongosh` inside its network namespace over verified loopback TLS.
- While the database is genuinely empty, use MongoDB's localhost exception to initiate `rs0` with member `mongo:27017`, wait for primary, then create the initial administrator.
- Authenticate as that administrator to create distinct runtime and migration users, apply collection validators/indexes, and confirm the runtime user cannot administer users/databases.
- Do not temporarily expose an unauthenticated network listener; the bootstrap exception must be usable only through the Mongo container's loopback connection.
- Repeated setup authenticates and checks recorded configuration; an existing volume with missing credentials fails with a recovery message rather than resetting or bypassing auth.
- Copy key/certificate material into a restricted named secret volume with the chosen image's actual Mongo UID; keyfile mode `0400`, private PEM/credential files `0600`.
- Do not assume macOS bind-mount ownership satisfies Mongo keyfile checks; document ownership staging and cleanup separately from data-volume deletion.
- Health waits for authenticated `hello` primary state, migration version and required indexes, with bounded retries and useful redacted diagnostics rather than arbitrary sleeps.
- Invalid CA, wrong hostname, plaintext access and incorrect password must fail; developer instructions must never recommend `tlsAllowInvalidCertificates` or hostname bypass.
- `dev:down` preserves data; `dev:reset` requires an exact local disposable database/Compose-project marker and explicit confirmation, and rejects remote/cloud URIs.
- CI additionally starts the production Mongo configuration with generated X.509 membership certificates and SCRAM runtime credentials; local keyfile success is insufficient evidence.
- Certificate renewal preserves the CA where appropriate, checks SAN/expiry and proves reconnect/restart behavior; tests include an expired leaf and untrusted replacement CA.

## 4. Command contracts to implement

These scripts are implementation requirements, not commands claimed to exist or to have passed in this design task.

| Command | Expected observable result |
| --- | --- |
| `npm ci` | Install the pinned workspace lockfile; fail on disagreement, without generating secrets or contacting production. |
| `npm run dev:doctor` | Report prerequisite/architecture/port problems with actionable remediation. |
| `npm run dev:setup` | Generate local secrets, start TLS services, initialize/authenticate `rs0`, migrate, and report the HTTPS URL. |
| `npm run dev:seed` | Seed fictional named scenarios in the marked local database using an explicit seed version. |
| `npm run dev` | Start Vite/API and local provider harness with a visible development indicator. |
| `npm run dev:container` | Run the equivalent workflow without host Node; preserve normal replica discovery. |
| `npm run dev:reset` | Reset only the explicitly confirmed local disposable state; never infer permission from a URI suffix alone. |
| `npm run check` | Lint, type-check, validate contracts/locales, and verify generated files are current. |
| `npm run test:unit` | Deterministic domain/DTO/component tests with fixed clock and generated boundary inputs. |
| `npm run test:integration` | Fresh authenticated TLS replica set; real transactions, indexes, permissions and concurrency assertions. |
| `npm run test:e2e` | Built frontend/API in a disposable fixture environment; browser workflows, accessibility and approved visual baselines. |
| `npm run test:release -- --image <digest>` | Exercise that exact runtime image, production entrypoint/TLS proxy and real client libraries against external doubles. |
| `npm run test:ops` | Disposable deployment/backup/restore harness, including failed rollout and data-preservation assertions. |
| `npm run test:providers` | Explicitly authorized real-account acceptance mode; refuses to run by default or against production with fixture credentials. |

## 5. Facebook simulation without a production login bypass

- Keep the fake authorization server, fixture-user picker and provider adapter factory in development/test packages excluded from production dependency layers and assets.
- Developer login still follows start → provider redirect → state-bound callback → server code exchange → session rotation; never mount an application `/test/login` route.
- The fake provider supports success, denial, missing/replayed/expired state, wrong app identity, reused code, token rejection, outage and malformed profile responses.
- Roles come from a fixture DB seed/operator harness; changing a provider profile, URL, request header or browser storage cannot manufacture helper/moderator privileges.
- Unit/source integration may inject the fake provider adapter; release-image tests execute the real Facebook client and only replace the external HTTP peer.
- The isolated release network resolves the configured Facebook hostnames to a TLS protocol double; its certificate is trusted only by the ephemeral application/browser test trust store.
- Keep the production endpoint allowlist unchanged; intercept the versioned code/token/profile requests the real client uses, and fail unexpected outbound requests.
- Synthetic app secret, one-use codes and app-scoped IDs are generated per run; no real accounts or provider passwords enter pull-request CI.
- Test production startup rejecting fake-adapter flags; inspect runtime dependencies/layers for fake packages and verify test-only URLs/routes return no handler.
- Production deploy helper controls an allowlisted environment and mounts: it must reject CI DNS/hosts overrides, injected trust roots, synthetic credential paths and test bootstraps.
- Evidence must say “real client against protocol double”; it must never say “Facebook login verified” until the genuine-provider checklist passes.

## 6. Private-image local adapter and release transport

- Define one storage contract: `putIfAbsent`, `readGeneration`, `deleteGeneration`, metadata/checksum verification and typed not-found/precondition/transient failures.
- The source-only filesystem adapter stores normalized bytes outside the web root, with opaque keys, immutable synthetic generations and atomic metadata; it exposes no static upload URL.
- Local and production requests share authorization, stream limits, decoder isolation, EXIF stripping, reservation/finalization and cleanup services; only object persistence changes.
- Production uses the host IAMCredentials token minter: a 10-minute storage access token refreshed every five minutes, consumed through the application's OAuth2Client/GCS client.
- Release-image tests replace only the external storage peer and token-file producer; a harness writes synthetic token/expiry data in the production format and uses isolated TLS/DNS.
- Mount a narrowly scoped token directory read-only in the application; atomic token-file replacement must become visible, unlike a single-file bind mount retaining an old inode.
- Test token rotation, malformed/expired credentials and minter failure; app never falls back to metadata/ADC or silently extends expiry, and image decoding receives no token mount.
- The protocol double must implement the exact upload/download/generation-precondition operations used; contract mismatches fail rather than becoming permissive success responses.
- Test no object can be fetched without Flock's current case ACL; object keys/generations and storage URLs stay absent from public responses, HTML and browser navigation.
- Cases save before photo upload; decode/upload/finalization failure preserves the report, reports the failed attachment accurately and permits an explicit retry or no-photo completion.
- Exercise exactly 10-MB/20-MP boundaries, over-limit streams, truncated payloads, MIME deception, SVG/HEIC/animated input, decompression bombs and slow uploads.
- Assert normalized output is at most 1600 pixels on its longest edge, correctly oriented, metadata-free, and the original disappears from temporary storage after every exit path.
- Inject crashes after reservation, object creation and DB commit; restarted cleanup must reconcile orphaned generations without deleting a successfully attached replacement.
- Race photo replacement/deletion, case hiding, account deletion and authorization revocation; a stale upload cannot finalize into a deleted or unauthorized case.
- Separate logical removal, durable deletion queued, and physical generation deletion completed in assertions; GCS retention/IAM behavior remains a real-provider acceptance item.

## 7. Fixtures and meaningful failure assertions

- Seed fictional places in a documented test region, never real rescue contact numbers, real Facebook profiles, private residences or copied user submissions.
- Freeze the clock and seed RNG; represent no feeding, bands 14/15/50/51, exact 48/96-hour boundaries, seven-day backdating and five-minute future skew.
- Zero birds is a no-action state: assert it cannot create a feeding or refresh recency; unknown flock size must remain distinct from zero.
- Clock injection belongs to source tests/browser harnesses; the production image has no clock-bypass endpoint, and release tests anchor fresh fixtures relative to actual server time.
- Add tied timestamps, hidden/deleted latest feedings, backdated insertion order, Stockholm DST transitions, nonfinite coordinates and longitude/latitude reversal.
- Provide anonymous, reporter, stranger, approved unassigned helper, assigned helper, revoked helper, moderator, suspended and deletion-pending identities with separate cookies.
- Put unique secret canaries in Facebook IDs, private notes, exact care coordinates and photo metadata; search all public responses and rendered/browser-stored data for leakage.
- Inspect public map cells, counts, search, history, errors, cursors and shared links, not just the primary detail DTO; hidden cases/places must not survive through aggregates.
- Race two independent connections claiming one case and require exactly one owner/event/outcome; retry with stale version and repeated idempotency keys.
- Race role revocation/account suspension with claim and photo finalization; a prior authorization read alone is insufficient under transaction snapshot isolation.
- Require a shared transactional authorization fence or equivalent serialization, then assert revocation completion prevents later grants/finalization and new private reads.
- Document the limit: bytes already delivered to an authorized reader cannot be recalled; tests target new access and work not yet committed, not impossible retroactive erasure.
- Inject a dropped response after commit: retry the original operation/key, require one database effect, and reject key reuse with a different payload.
- Reauthorize replayed idempotency results; cached success must not re-expose private detail after role removal, case hiding or account deletion.
- Force partial place-plus-feeding failure and unknown commit outcome; assert atomic rollback or one reconciled committed pair, with no invented success notification.
- Check expired sessions before TTL cleanup, rotated IDs after login, logout across tabs, CSRF/Origin/Host rejection, open redirects, forged forwarding headers and role mass assignment.
- Use barriers/failpoints in disposable test infrastructure rather than timing sleeps; test-only synchronization hooks must be absent from the production HTTP surface.

## 8. Deterministic pull-request and main gates

- Every PR runs clean lockfile installation, checks, unit/component tests, TLS replica integration, built-app browser tests, accessibility/visual checks and release-image/ops smoke tests.
- PR jobs have read-only permissions, no production secrets or cloud federation; fork contributions never run through a privileged `pull_request_target` workflow.
- Every push to `main`, including merges, reruns all required gates for that exact SHA; do not deploy an artifact tested only on the PR merge candidate or previous SHA.
- Build the runtime image once, record its digest, and test those bytes; publish/load/export must preserve the tested OCI digest, with an explicit equality check before deployment.
- A main-only trusted publish job obtains short-lived WIF access after tests; missing deployment configuration is a hard error, never a skipped step reported as success.
- Pin Node, packages, containers, action commits, browser binaries, fonts, locale, timezone, fixtures and map styles; reject accidental live provider access in deterministic suites.
- Run Chromium mobile/desktop full flows and Firefox/WebKit smoke flows; emulation establishes viewport behavior, while actual Safari/iOS and Android checks remain manual.
- CI uses synthetic local map tiles/styles with deterministic geometry and attribution; it still exercises the real renderer, with separate provider-failure/list-fallback scenarios.
- Require nonzero test discovery, named suite completion, machine-readable reports and bounded timeouts; retries cannot conceal a consistently failing required test.
- A flaky mandatory test blocks release until fixed or deliberately replaced by equivalent evidence; do not quarantine a privacy/auth/race invariant and silently keep deploying.
- Secret/dependency/runtime-image scans use a recorded database/version; newly discovered vulnerabilities are nondeterministic inputs with explicit severity and expiring exception rules.
- Store SHA, digest, seed, browser versions and reports; traces/screenshots contain only synthetic data and have bounded retention; redact auth headers/codes even in fixtures.
- The final deploy job depends on every required gate; fault-inject one failing check and prove no publish/deploy credentials or remote deployment invocation become reachable.
- CI validates pipeline conditions and local helper behavior; only a controlled real main push can prove GitHub permissions, WIF, IAP, root-owned helper and GCP wiring together.

## 9. Mobile, accessibility, visual and performance evidence

- Compare approved implementation baselines with the supplied mockup at 390×844 and 1440×900; a first snapshot is review material, not automatic proof of fidelity.
- Preserve purple hierarchy, map-first layout, recency/unknown distinction and care accents; replace messaging controls and misleading alert/hunger copy intentionally.
- Run layout tests at 320, 360, 390, 768 and 1440 CSS pixels, short landscape, long Swedish labels, enlarged text and denied geolocation; assert no hidden primary actions.
- Freeze data/time/fonts and disable incidental animation; mask only nondeterministic basemap content where unavoidable, never status, privacy warnings, controls or error messages.
- Automated accessibility checks run on every route and modal/sheet/error state; keyboard tests cover list alternative, manual pin selection, radio groups, focus restoration and error summary.
- Manual prelaunch checks cover VoiceOver on iPhone/macOS, TalkBack on Android, visible focus, 200% text scaling/400% zoom, contrast, reduced motion and touch targets.
- Physical-phone checks exercise safe-area insets, virtual keyboard, photo picker/camera cancellation, background/resume, slow connection and expired session during submission.
- CI blocks excessive bundle growth against an approved budget and catches accidental unbounded queries/payloads; shared hosted-runner wall-clock timing is not a VM performance gate.
- On the target VM profile, run a controlled 10k-place/100k-feeding dataset at 20 requests/s for a documented warm-up and at least ten measured minutes.
- Proposed acceptance is public API p95 <500ms with error rate <1%, bounded query plans/payloads and no memory/disk saturation; report p99, throughput and resource use too.
- Exercise photo processing, a backup and overlapping release slots under load; use results to reduce concurrency, schedule work or resize the VM before promising capacity.
- Measure mobile LCP ≤2.5s under a recorded device/network/cache profile and real tiles separately; repeat runs and report distribution, failures and provider dependence.

## 10. Real-provider and production acceptance

- Before first public launch, operator-controlled acceptance uses the exact production origin, real Meta app/configuration and a designated consenting test account; no password automation in CI.
- Verify successful login, denied consent, logout/relogin, minimal granted permissions, fixed callback URL, provider app/user validation and session rotation; retain redacted evidence.
- Confirm Meta app mode/review/business prerequisites, Graph version and signed deletion/deauthorization formats against current official material and the real dashboard.
- Exercise signed callback rejection, valid deletion receipt and replay handling using the confirmed format; unavailable documentation/approval remains a launch blocker, not a fake-test pass.
- Genuine local login uses a separate Meta development app and explicitly registered HTTPS callback/tunnel only after permitted URI rules are verified; never reuse production secrets.
- Check production GCS Public Access Prevention/uniform access, anonymous download denial, generation preconditions, attachment read/revoke and exact-generation deletion with real IAM.
- Verify runtime cannot administer buckets, backup writer cannot delete backups, and the restore operator has only the documented additional recovery privileges.
- Verify real map attribution/origin restriction/quota and failure fallback; approve current EN/SV emergency directory, privacy/deletion notices and operator contact.
- Check DNS A/AAAA behavior, trusted HTTPS certificate, redirects, security/private-cache headers and public port exposure at `https://theflock.icet-lab.eu`.
- Initial acceptance may run behind a maintenance/access gate; opening public access is a one-time controlled launch action, while later successful main pushes deploy automatically.

## 11. Deployment, recovery and recurring checks

- Per-commit CI helper drills simulate candidate readiness failure, post-switch smoke failure, rollback failure, competing/stale releases and incompatible migrations using disposable volumes.
- Assert previous release remains/reappears, failed Actions remain failed, old requests drain, release identity matches digest, and Mongo data/volume is untouched by an app rollback.
- Before launch, perform a real main push that changes the public release SHA, then a controlled failing candidate that restores the prior release without deleting writes made during the drill.
- Test the root-owned helper's argument validation and privilege boundary; a release cannot supply arbitrary shell, Docker mounts, Compose files, secret paths or a database reset command.
- Run a synthetic consistent dump/restore plus deletion-ledger replay in CI; use full replica-set oplog capture and compatible tool versions, not a live data-directory copy.
- Prelaunch and monthly, restore a protected off-VM backup plus referenced media generations into an isolated environment; never replay a drill over the live database.
- Apply the off-backup deletion journal, expire restored sessions/OAuth/export credentials, reset helper/moderator roles to member and clear assignments before restoring access.
- Regrant privileges only through the documented operator identity-verification procedure; assert a backup cannot resurrect a revoked helper, moderator or sensitive case assignment.
- Time recovery against provisional RPO 6h/RTO 4h, measure backup age/capture loss, verify indexes/validators and sample image checksums, and record failure/remediation explicitly.
- Test missing/wrong persistent-disk mounts refusing Mongo startup, full disk, failed uploads, expired DB certificate and secret/CA recovery; a healthy app-only restore is incomplete.
- Recurring operations run six-hour backups and freshness/expiry/uptime alerts continuously; scheduled daily dependency scans and weekly synthetic public browse checks report separately from releases.
- Repeat genuine Facebook/GCS acceptance after auth/client/IAM changes and at least quarterly; use a designated account/operator and synthetic media, with cleanup and no unattended login bypass.
- Monthly restore and certificate-rotation drills are operator-owned evidence with a due date; CI green must not hide an overdue or failed operational check.

## 12. Milestone completion evidence

- M1: clean Intel/Apple Silicon and container-only setup; documented TLS trust, authenticated replica transactions, seed/reset safety and deterministic fake login/media flow.
- M2: public places/feedings, genuine callback design verified, private DTO canary tests, idempotency and security suites; anonymous browsing and login cancellation preserve unsaved intent.
- M3: care ACL/claim/revocation races, one-photo lifecycle, deletion/export and bilingual mobile/accessibility flows pass; no messaging endpoint/model/control exists.
- M4: protected main pipeline executes real tests, publishes the tested digest and automatically deploys it; stale/failing candidate and rollback evidence include preserved data.
- M5: real Facebook/GCS/maps/DNS acceptance, measured VM/mobile performance, approved content and timed off-VM restore are recorded before public launch.
- Every evidence record names SHA/digest, environment, command/procedure, timestamp, result, failures and reviewer/operator; planned, simulated, verified and unknown remain distinct.
- Unresolved blockers are provider/app approval and configuration, canonical privacy/retention choices, supported image/tool pins, resource measurements and actual restore proof; this document resolves none by assertion.
