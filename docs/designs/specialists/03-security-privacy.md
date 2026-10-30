# Flock security, privacy and identity design

> Historical proposal: the current [integrated design](../flock-design.md) and [community-care revision](../../development/community-care-revision.md) supersede anonymous attribution, private contribution notes, approved-helper roles and separate bird coordinates below. This snapshot is retained as earlier design evidence.

Status: specialist advice for integration; design only, with no deployment or provider approval claimed.
Scope: public place-based feeding observations, private care details, Facebook login, one optional care photo, and no messaging in v1.
Deployment: Vue and Express share `https://theflock.icet-lab.eu`; Caddy terminates HTTPS; MongoDB runs on the same Google Cloud VM.
Provider-specific behavior marked `[VERIFY]` requires current official documentation and a real integration check before launch.
Checked provider references and the unresolved Meta documentation access gap are recorded in [provider-evidence.md](../provider-evidence.md).

## 1. Security objectives and trust boundaries

- Anyone may read the deliberately public map, places and anonymous feeding activity.
- Public access must not expose Facebook identifiers, contributor identity, private notes, care photos or exact care-report coordinates.
- A place coordinate describes an intentionally published feeding place; it is not a contributor's location history.
- A session establishes identity; each API operation independently checks permission against current database state.
- Treat browser input, Facebook callback parameters, upload metadata, third-party tiles and public repository contributions as untrusted.
- Trust boundaries are browser → Caddy → Express, Express → MongoDB, Express → Facebook, Express → private GCS, and deployment → VM.
- Caddy and Express share the VM with MongoDB: a VM/root compromise can expose application data and runtime secrets.
- TLS, disk encryption and database authentication reduce distinct risks; none isolates MongoDB from a compromised privileged VM.
- The single VM is a deliberate availability compromise: host failure or resource exhaustion interrupts both app and database.
- Public content can be scraped or copied; removing it from Flock cannot recall third-party copies.

| Threat | Required controls | Remaining limit |
| --- | --- | --- |
| Tracking contributors from feeding logs | No actor identifiers, names, avatars or public profiles; coarse public time | A person's disclosed habits or a quiet location can still support inference |
| Care-location harvesting | Dedicated public DTO; approved-helper authorization for private detail | A legitimately authorized person can copy what they see |
| Login CSRF, session fixation or theft | Bound one-time state, session rotation, HttpOnly cookie, CSRF checks | Browser/device compromise remains outside these controls |
| IDOR and role escalation | Object-level policy on every read/write; server-owned privilege fields | Administrators and host operators retain powerful access |
| Stored XSS and malicious uploads | Plain-text rendering, CSP, validated isolated image conversion | Dependency vulnerabilities require patching |
| Spam, false reports and cost abuse | Limits, moderation, upload quotas and bounded map queries | Facebook login does not establish a user's real-world trustworthiness |
| Supply-chain or secret exposure | Protected release path, least privilege, no secrets in public source | Maintainer and dependency compromise remain possible |

## 2. Data publication and precision

- Implement explicit allowlisted serializers such as `PublicPlace`, `PublicFeeding` and `PublicCareSummary`; never serialize database documents directly.
- Use separate private response types and routes, rather than optional fields enabled by query parameters.
- Public places expose name, published coordinate, reviewed description and aggregate feeding/care status.
- The add-place UI says the chosen pin and place name will be public before saving; dragging the pin is always available.
- Public place coordinates retain useful map precision, capped at five decimal places; the exact selected place is intentionally public.
- Do not imply that decimal rounding anonymizes a place, especially if it is a home or otherwise identifying location.
- Reject or moderate places describing private homes, access-restricted sites or sensitive wildlife locations according to a published policy.
- Public feeding rows expose place, flock-size category, food category and UTC calendar date; omit author ID/name/avatar and free-text notes.
- The map receives server-calculated recency categories and coarse labels, not exact feeding timestamps from which it can rebuild individual visits.
- Keep `occurredAt` and server `createdAt` privately for validation and recency; do not expose precise times through sort keys or metadata.
- Feeding notes are visible only to their author and moderators; label this field accurately in the UI.
- V1 feeding submissions always contribute to public anonymous activity; there is no separate private-feeding setting.
- Public care summaries expose associated public place, structured concern/urgency/status, coarse update date and a moderator-approved safe summary if present.
- They exclude exact report coordinates, raw description, reporter/helper IDs, free-text updates, photo URLs, attachment IDs and an identifiable volunteer roster.
- Private care details require reporter, current assigned approved helper, or moderator permission.
- Public care rows must not leak precise coordinates through GeoJSON, bounding boxes, HTML metadata, structured data, error text or export links.
- Do not use deterministic contributor pseudonyms in public logs: they recreate a cross-place activity trail.
- Geolocation is requested only after a user action; calculate proximity in the browser and discard live position when the page no longer needs it.
- Ordinary map browsing sends only the requested map area, never a separate live-location stream; no background GPS or location analytics.
- Saving a place or care report explicitly submits the selected pin; browser permission alone is not consent to publish the user's position.
- Keep the browser's accuracy estimate local unless a documented case requirement justifies storing it; do not retain raw location fixes.
- Map/tile providers receive network and viewport information; disclose this dependency and avoid centering on precise user location automatically.

## 3. Roles and object authorization

- `member`: authenticated contributor; may create allowed records, see/edit their own private content, and manage their account.
- `approvedHelper`: moderator-granted capability, with grant actor/time and revocation audit; not an automatic consequence of Facebook login.
- `moderator`: reviews public content, sees care details when needed, grants/revokes helper capability, resolves abusive content and case disputes.
- `administrator`: manages moderator membership and operational configuration; no public HTTP route may bootstrap this role.
- Bootstrap the first administrator through an audited operator command; subsequent grants require an administrator and recent reauthentication.
- A moderator cannot grant themselves administrator privileges; APIs reject mass assignment of any role, owner or moderation field.
- A helper can atomically claim an unassigned case only while currently approved; the claim records its actor and version.
- An ordinary member may express interest but receives only the public projection until approved and assigned.
- The assigned helper loses private case/photo access immediately on unassignment, account suspension or capability revocation.
- No broad helper directory or list of private care locations is required: helpers initially browse public place-level summaries.
- Reporter and moderator may resolve a case; any helper resolution right must be explicitly scoped to their current assignment.
- Case updates preserve authorship internally, but public structured updates omit contributor identity and raw text.
- Every ownership/assignment check uses the authenticated internal user ID, never a submitted owner ID or Facebook ID.
- Unpredictable record IDs reduce enumeration but do not substitute for authorization; private forbidden/not-found responses are indistinguishable.
- Check current roles/account status from MongoDB on privileged requests; sessions must not preserve stale authorization grants.
- Validate allowed state transitions server-side and use conditional updates/version checks to prevent conflicting claims or stale resolutions.

## 4. Facebook authorization-code flow

1. `GET /api/session` creates a short-lived anonymous session if needed and returns a session-bound CSRF token with `Cache-Control: no-store`.
2. `POST /auth/facebook/start` requires valid CSRF and exact approved `Origin`; accept only a server-validated local destination and structured pending UI intent.
3. Generate at least 32 random bytes of OAuth `state`; store only its hash with initiating session ID, ten-minute expiry and destination.
4. Redirect to the configured Facebook authorization endpoint, requesting only `public_profile`; do not request `email` without a concrete feature need.
5. Use the exact registered HTTPS callback `https://theflock.icet-lab.eu/auth/facebook/callback`; never derive redirect URI from an untrusted Host header.
6. On callback, require the initiating cookie, constant-time state comparison, correct expiry and atomic one-time consumption before code exchange.
7. A cancellation with valid state returns to a safe local screen; missing/invalid state produces a generic error and does not establish a session.
8. Exchange the code server-to-server using the app secret and exactly the same redirect URI; the browser never receives an access token.
9. Validate the returned token's application binding, app-scoped user ID, validity and applicable expiry with the documented provider endpoint, then fetch the minimal identity fields.
10. Require token inspection and `/me` identity to agree; map identity by unique `(provider = facebook, configuredAppId, appScopedUserId)`.
11. Create or load the internal account, apply suspension/deletion checks, rotate session ID and CSRF token, and discard transient Facebook tokens.
12. Redirect with `303` to the validated application route, removing callback parameters from the visible URL; show the pending form for confirmation.

- Store no Facebook access/refresh tokens after login: v1 has no Graph API activity or posting feature that requires them.
- Do not persist Facebook name, email or profile picture by default; Flock can greet the user generically and retain only the identity key needed for login.
- Rewrite mockup promises about names/photos appearing in feeding logs, email access, messaging and public profile customization.
- If a future private display name is retained, make its visibility explicit and exclude it from all public DTOs.
- Never merge accounts by email/name or accept a Facebook identifier supplied by the frontend as authentication.
- Allow only known internal route names or validated single-leading-slash paths; reject `//`, schemes, backslashes and encoded bypasses.
- Pending login intent describes a screen and record reference, not a trusted mutation; revalidate the target and require an explicit save after login.
- Callback responses use `Referrer-Policy: no-referrer` and contain no third-party resources; redact callback query strings from all logs.
- `[VERIFY]` Pin the Graph API version and verify supported authorization parameters, token-inspection fields, token transport and `appsecret_proof` requirements.
- `[VERIFY]` Use PKCE if the selected Facebook web-login flow officially supports it; do not assume support or substitute it for state/session binding.
- `[VERIFY]` Confirm Meta app configuration, production mode, allowed domains, callback URLs and any review/business-verification requirements; none are assumed approved.

## 5. Session, CSRF and browser protections

- Use an opaque random session ID with at least 256 bits of entropy; store its hash and server-side state in MongoDB, not in browser storage.
- Production cookie: `__Host-flock`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain` attribute.
- Anonymous sessions expire after ten minutes; authenticated sessions expire after 24 hours idle or seven days absolute, whichever occurs first.
- Server-side expiry checks are authoritative; MongoDB TTL indexes are asynchronous cleanup only.
- Rotate sessions at successful login and privilege changes; logout revokes the server record and clears the cookie.
- Account deletion/suspension and provider deauthorization revoke all associated sessions, not only the current browser's session.
- Require session-bound CSRF tokens and exact Origin checks on all browser-originated mutations, including login initiation, logout, claim and upload.
- Reject unsafe requests with missing/foreign Origin by default; the separately verified provider callbacks are narrowly documented exceptions.
- Only safe methods perform safe operations; `GET` must not save feedings, resolve cases, delete data or log users out.
- Disable cross-origin API access; use no wildcard credentialed CORS and no tokens in URLs, localStorage or sessionStorage.
- Reauthentication within ten minutes is required for account deletion, data export and role grants; bind the new Facebook identity to the existing account.
- A fresh redirect alone is not reauthentication: `[VERIFY]` use the provider's documented reauthentication facility and confirm its guarantees.
- If reliable provider reauthentication cannot be established, do not claim it; use a documented operator-assisted sensitive-action process until resolved.
- Vue renders user content as text; prohibit `v-html`, raw Markdown HTML and arbitrary user-provided links in v1 fields.
- CSP starts with `default-src 'self'`, no inline/eval scripts, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`; add only required map hosts.
- Add `X-Content-Type-Options: nosniff`, a restrictive `Permissions-Policy`, and `Referrer-Policy: strict-origin-when-cross-origin` for ordinary pages.
- Enable HSTS after HTTPS is proven; do not enable parent-domain `includeSubDomains` or preload without authority over those domains.
- Trust only Caddy as proxy; sanitize forwarded headers at the proxy and set Express proxy trust to that exact deployment path.

## 6. Local testing and unavailable login

- Public browsing remains available if Facebook fails; contributions display a clear retryable login error without losing an unsaved local form.
- Production has no fake-login route, password fallback, development admin account or client-side identity override.
- A fake provider may run only in development/test builds, explicitly enabled, bound to loopback, with an approved localhost application origin.
- Production startup fails if fake authentication is enabled; production images omit fake-provider routes and fixtures entirely.
- Reject fake-provider requests with non-loopback Host/Origin; bind the development server to `127.0.0.1` rather than relying only on header checks.
- Use a separate development database, secrets and cookie name; test identities live under provider `fake`, never `facebook`.
- Fake auth supports success, cancellation, expired/replayed state and token-exchange failure so the real application state machine is exercised.
- Deterministic fake identities are acceptable only within the local test database; no real production data is copied into it.
- Real-provider smoke tests use a separate Meta development app/test users and documented callback configuration; a fake flow does not validate Meta integration.
- `[VERIFY]` Confirm allowed localhost callbacks and available test-user facilities; if necessary use a deliberately configured HTTPS development endpoint, never expose fake auth there.

## 7. One private care photo

- V1 accepts at most one photo per care report; only its reporter may upload/replace it, subject to account and case permissions.
- Accept static JPEG, PNG and WebP only; reject SVG, HTML, GIF, animated formats, external URLs and client-selected storage keys.
- Enforce 10 MiB compressed request/file cap, 20 megapixels decoded, maximum side 8192 pixels and one decoded frame before publication.
- Caddy/Express enforce request limits and upload deadlines; stream to bounded temporary storage rather than buffering arbitrary files in memory.
- Verify magic bytes and decoded format, ignore filename/MIME claims, and reject truncated files and inconsistent dimensions.
- Decode in a separate unprivileged worker with no network, bounded temporary space, 256 MiB memory and a five-second processing budget; tune only after tests.
- Reencode to a fresh JPEG/WebP of at most 1600 pixels on the longest edge, with no EXIF, GPS, comments, original filename or embedded profiles beyond required safe color conversion.
- Upload only the reencoded artifact to private GCS; delete original temporary input on success, rejection, timeout and worker crash recovery.
- A photo is not available until conversion and attachment ownership are committed; staged objects use random keys and expire after one hour if unattached.
- Use uniform bucket-level access and public-access prevention; never grant `allUsers`, return a public URL or expose a reusable signed URL.
- Serve through `GET /api/care-reports/:id/photo` after checking reporter, current assigned approved helper or moderator permission on every request.
- Responses use a server-selected image MIME type, fixed safe filename, `nosniff`, `Cache-Control: private, no-store` and no external redirect.
- The same privacy policy applies to thumbnails and exports; opaque object keys and bucket names are absent from public DTOs.
- Revocation stops future fetches but cannot erase bytes already viewed or saved; the UI must not promise recall.
- Give users a short instruction to avoid people, addresses and identifying details; EXIF removal does not remove visible identifying content.
- Remove attachment references immediately on deletion; retry physical object deletion with an idempotent durable job and include versions in retention accounting.
- Malware scanning may supplement this pipeline; it does not replace safe decoding, resource limits or authorization.

## 8. MongoDB and VM protections

- MongoDB is self-hosted on this same VM as a private single-node replica set; no Atlas dependency or exposed MongoDB port.
- In Compose, place MongoDB on a private internal data network shared only with the app/authorized jobs; publish no host `27017` mapping.
- Bind MongoDB only to the required private interface; do not confuse container-local loopback with reachability from the application container.
- Enable authorization and `requireTLS`; use a private CA, hostname-valid server certificate and validating clients with no insecure TLS overrides.
- Use `clusterAuthMode: x509` for production replica-set internal authentication, with valid membership certificates even with one current member; local development may use a protected keyfile.
- Use SCRAM-SHA-256 application users over validated TLS; internal member authentication and client authorization are separate controls.
- Monitor certificate expiry and document rotation/restart recovery; an expired private CA/server certificate must fail closed, not disable TLS validation.
- App credentials may read/write the Flock collections needed at runtime; separate migration and backup principals carry their own minimal permissions.
- Do not grant the app root/admin roles or permissions to administer database users, perform host backup operations or modify server configuration.
- Mount persistent MongoDB storage with narrow file ownership; protect keyfiles and private keys with restrictive permissions and read-only mounts where possible.
- Only Caddy publishes public ports 80/443; restrict SSH through the selected operator access mechanism and do not open database monitoring ports publicly.
- Protect the database from image-worker resource exhaustion using explicit service CPU/memory limits and disk-space alerts.
- VM/root and database maintenance access are privileged operational actions; record who acted and avoid shared interactive credentials.
- Use encrypted Google persistent disks and encrypted remote backups; encryption does not prevent authorized runtime processes from reading plaintext.
- Keep the minimum runtime service-account permissions, scoped to the required secrets and private object/backup buckets; no broad project Editor role.

## 9. Public repository, secrets and release security

- `.env.example` contains names and harmless placeholders only; ignore real environment files, certificates, database dumps, OAuth tokens and developer exports.
- Store production secrets in Secret Manager or an equivalently restricted operator-managed store, and mount them outside the web root and image layers.
- Use separate secrets and Facebook apps for production and development; rotate any value ever committed, including values later removed from Git history.
- Prefer GitHub Actions workload identity federation over long-lived Google JSON keys; scope trust to the actual repository and approved release ref/environment.
- Treat public pull requests as untrusted code: no production secrets, deployment identity or write permissions in their test jobs.
- Deploy only the reviewed main-branch commit through protected configuration; pin external Actions to commit SHAs and image releases to immutable digests.
- Set explicit workflow permissions, preserve lockfiles, and scan changes for secrets and vulnerable dependencies; define an owner for actionable alerts.
- A dependency scan passing does not establish security; patch exposed runtime/image-decoder issues and keep rollback images usable.
- Never place secrets or private configuration in Vue `VITE_*` variables, generated assets, source maps or client logs.
- Allow outbound application integrations only to intended providers; there is no arbitrary URL-fetch, avatar-proxy or URL-photo-import API in v1.

## 10. Export, deletion and provider callbacks

- `POST /api/account/export` requires current authentication, CSRF and recent verified reauthentication; create a private short-lived export job.
- Export contains the requester's account data and authored records, including their own private notes/photos, excluding other users' private details and credentials.
- Serve exports only through an authenticated ownership-checked route with `no-store`; expire generated files after one hour and never email public links.
- `POST /api/account/delete` immediately marks the account deleting, revokes sessions and prevents new mutations; a durable idempotent job removes its data within 24 hours.
- Delete Facebook identity mapping, private notes, case details/photos, sessions and personal profile data; erase feeding rows and recompute public aggregates.
- Retain a useful public place only if it contains no personal information and is detached from its creator; hide unresolved questionable content for review.
- Do not retain purportedly anonymous personal text or exact case coordinates by simply setting `authorId = null`.
- Public case aggregates may remain only after removing their personal/private source material; define cross-author cases explicitly in the deletion job.
- Preserve other users' independent records where possible; never include their private information in a requester's export or delete their account because it references a case.
- A separate Facebook data-deletion callback is CSRF-exempt only because it verifies the provider's signed payload before any lookup or mutation.
- Parse the size-bounded `signed_request` strictly; verify declared `HMAC-SHA256` and constant-time HMAC of the original encoded payload using the configured app secret.
- Reject malformed encodings, missing identity and invalid signatures; validate documented timing fields without rejecting legitimate delayed provider retries by guesswork.
- Never trust decoded `user_id` before signature verification; resolve it only within the configured Facebook app's identity namespace.
- Valid deletion requests enqueue the same deletion workflow; duplicate or unknown users get an idempotent accepted response without account enumeration.
- Keep a digest of accepted signed requests with the deletion receipt; replay must return that receipt rather than deleting a subsequently recreated account.
- Where the documented payload supplies a trustworthy issue time, reject application to an account created after that deletion request; verify the provider's retry semantics before finalizing this rule.
- Return the documented JSON `url` and `confirmation_code`; use a random unguessable receipt and show only generic processing/completion state at its status URL.
- The status page has no user identifiers, third-party scripts or detailed record counts, uses `no-store`/`no-referrer`, and expires after the documented receipt period.
- `[VERIFY]` Confirm current Meta callback payload, signature encoding, response schema, delivery retries and required public data-deletion/privacy-policy URLs.
- Handle Facebook deauthorization separately: validate its signed payload, revoke sessions immediately and follow the published retention/deletion policy.

## 11. Retention, backups and audit boundaries

- Proposed operational defaults: private care detail/photos expire 30 days after case closure; public anonymous feeding rows expire after 365 days.
- Expiry must delete underlying private content and objects, not merely filter the UI; open cases need an explicit stale-case review process.
- Default application/security-log retention is 30 days, with IP addresses retained for at most seven days where needed for abuse response.
- Never log request bodies, authorization codes/tokens, cookies, Facebook IDs, care coordinates/descriptions, upload bytes or export contents.
- Privileged-action audit records include internal actor ID, action, target ID, time and outcome; minimize unrelated content and restrict access to operators.
- Store encrypted consistent daily backups outside the VM with a 30-day expiry; include MongoDB and the private-photo recovery policy in restore tests.
- Object versions, snapshots, soft-delete windows and replicated copies must not silently exceed the published retention period.
- Keep a protected off-VM deletion journal sufficient to reapply erasure after a restore; use minimal internal IDs and keyed provider-identity digests for replay handling.
- Retain journal entries through the longest recoverable backup lifetime plus seven days; restrict journal/key access independently of ordinary app content.
- Restore into an isolated environment, apply the deletion journal, purge restored sessions and reconcile roles/helper grants with the current protected administrative record before reopening traffic.
- Tell users that active-system erasure targets 24 hours and expired backup copies age out within 30 days; these are implementation targets, not legal-compliance claims.
- Confirm the actual controller/operator, lawful basis, notice, contact and retention commitments before launch; document decisions without asserting GDPR/Meta compliance.

## 12. Abuse, caching and release gates

- Initial limits: 10 login starts per IP per ten minutes; 30 contribution writes per account per hour; 10 photo attempts per account per hour; 10 sensitive-action initiations per account per hour.
- Add a separate 5-per-day successful export limit and one in-flight export; repeated deletion requests remain idempotent and do not schedule duplicate work.
- Bound map queries by viewport/zoom and result cap; paginate histories and reject unbounded filters, MongoDB operators and arbitrary sort fields.
- Use a trusted source IP behind Caddy; prefer account limits after login and provide operator recovery for shared-network false positives.
- Cache only explicit public projections; authenticated/private/photo/export/auth responses always use `private, no-store` and are excluded from service-worker caching.
- V1 has no offline private-data cache; logout clears in-memory private views and app-managed caches but cannot recall files users downloaded.
- Public API caches live at most 60 seconds and invalidate on moderation/deletion; never share a response that varies by account through the public cache key.
- Launch tests must exercise state mismatch/expiry/replay, login cancellation, session fixation, foreign-Origin CSRF and hostile redirect destinations.
- Test every private route with owner, stranger, assigned helper, unapproved/unassigned/revoked helper, moderator and suspended account identities.
- Snapshot public JSON/GeoJSON/HTML responses to prove absence of identity, exact care coordinates, notes, attachments and precise contributor timestamps.
- Test invalid, oversized, animated, decompression-heavy and metadata-bearing images; prove no original or inaccessible staged artifact becomes public.
- Verify MongoDB is unreachable from the public network, TLS/auth failures fail closed, fake auth is absent in release artifacts, and backup restoration reapplies deletion/revocation.
- Test signed deletion callbacks against tampering, unknown users, duplicate delivery, partial object deletion and retry after process restart.
- A real Facebook production-like smoke test, public privacy/deletion pages, provider configuration and image-worker resource checks are explicit release gates.
