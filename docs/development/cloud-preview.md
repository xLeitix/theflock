# First Google Cloud deployment: protected preview

Status: initial preview deployed on 1 November 2026; ongoing main-push release results are visible in [GitHub Actions](https://github.com/xLeitix/theflock/actions/workflows/release.yml). The user selected a separate Google Cloud project, retained `main` as the deployment branch and explicitly requested a password-protected preview before Facebook authentication. This is a limited deployment milestone; the full production requirements remain in the application design.

## Deployment contract

- Project `theflock-icet`, Stockholm `europe-north2`, initially an `e2-micro` with 1 GiB RAM. Validate actual memory use and application workflows before accepting that size. Build the application on GitHub, never on the VM. Bound MongoDB's WiredTiger cache to 256 MiB and the Node heap to 128 MiB.
- One VM hosts Caddy, authenticated MongoDB and the compiled application. MongoDB and Express listen only on loopback. A separate persistent data disk survives VM deletion; no deployment resets it. Use encrypted Google-managed disks, an off-VM backup and restricted service accounts.
- HTTPS `theflock.icet-lab.eu` requires a preview username/password before serving any application resource. Caddy overwrites a secret gateway header; Express independently rejects requests without it. Secure, HttpOnly, SameSite cookies and origin/CSRF checks remain mandatory. No public demo login is permitted.
- Simulated member/moderator selection remains available only behind this preview gate. Seed a new isolated `flock_preview` database with fictional data; do not upload the developer's database or sessions. The UI identifies the environment as a protected preview and requests fictional data only. Facebook and real-user production launch remain deferred.
- Pushes to `main` run CI, build an immutable container, test the container's preview boundary, publish a signed eligibility record, then deploy that exact digest through IAP and a constrained root-owned VM helper. Use GitHub OIDC / Google Workload Identity Federation, never service-account JSON keys. Publishing, verification and deployment have separate identities.
- Serialize deployments and reject stale commits both before remote invocation and inside the VM lock. Keep the prior image and restore it if candidate health fails. This 1 GiB preview uses a brief stop/start rather than simultaneous blue/green instances; a failed initial release leaves only the password-protected maintenance page. The schema is unchanged and incompatible migrations are refused.
- DNS is hosted by DigitalOcean. Add only the `theflock` record after allocating a static address; preserve the domain's nameservers and other records.

## Operations and credentials

The reserved IPv4 address is `34.2.60.117`; the user added its DigitalOcean A record and it resolves through authoritative DNS and public resolvers. The VM is `flock-preview` in `europe-north2-a`. Only ports 80/443 are public. SSH requires Google's IAP range and OS Login. Non-root processes cannot reach metadata credential HTTP(S); DNS and NTP at the same Google metadata IP must remain allowed.

The operator's preview login is in the ignored mode-0600 file `.local/cloud/preview-login.txt`. The complete generated credential set is stored in Secret Manager `flock-preview` in this project, accessible to the VM identity, and in the operator's ignored `.local/cloud/preview-secrets.json`. Neither enters Git, the container image, workflow artifacts or logs. Do not paste credentials into GitHub variables. Password rotation currently requires an operator to rotate Secret Manager and update Caddy's hash; updating a secret version alone does not refresh the VM.

The user explicitly approved private backups of this VM's preview database, including its fictional records, database accounts and sessions, to `gs://theflock-icet-backups` every four hours. `flock-backup.timer` invokes the root-owned helper; deployments also require a successful backup before stopping the current container. Dumps include the oplog and use a random object name with a create-only precondition. Uploads larger than 64 MiB fail closed until a streaming uploader is implemented. Automatic backup deletion remains disabled; review storage growth manually. This is a small-preview backup mechanism, not certification of the full production recovery/erasure design.

`/usr/local/sbin/flock-deploy` accepts only a commit SHA and registry digest (plus its operator recovery entrypoint). It verifies a signed eligibility record against the installed KMS public key, checks the pulled image's config digest and revision, and maintains `/var/lib/flock/current.json` and a pending journal. A recovery service runs before Caddy after a VM restart. The deploy identity has ordinary OS Login and sudo access only to this helper; it has no Docker-group or general sudo membership. Root helpers remain operator-installed; a repository push cannot replace them.

Provisioning entrypoints under `deploy/` describe the existing infrastructure and are operator tools, not application startup code. Review their fixed project/region/repository values before reuse. `scripts/verify-preview.mjs` performs an authenticated mobile/desktop smoke test using the private local credentials and records the exact fictional test feeding for cleanup. The local development commands remain unchanged.

## Validation required before handover

Local typechecking, API/runtime regression tests and browser workflows; container build and preview-boundary tests on GitHub; actual main-push release; unauthenticated HTTP/HTTPS and forged gateway rejection; authenticated UI and write/read persistence; VM memory and service inspection; same-digest deployment repeat and rollback checks; backup archive and isolated restore verification. Record actual outcomes separately from intended controls.

## Findings incorporated during implementation

- Docker stores expose different meanings for image `Id`. Signing and VM verification must read the OCI config digest explicitly from the immutable registry manifest, independently of the store's image ID, and still verify the pulled digest, Linux/amd64 platform and revision.
- GCE uses `169.254.169.254` for DNS as well as metadata. Block non-root credential HTTP(S), preserving DNS/NTP. The initialized-VM startup path can safely apply that correction without recreating storage or secrets.
- A deterministic browser regression reproduced a delayed anonymous session response overwriting a successful login. Session refreshes carry a generation invalidated by login/logout, and ordinary reads must not rewrite the browser's session cookie. The browser cookie lasts at most the seven-day absolute session lifetime; the guarded Mongo store still enforces the shorter 24-hour idle lifetime. These are independent limits.
- Compiled hosting must serve the frontend for the two declared page URLs, `/` and `/emergency`, while preserving 404 responses for unknown paths and private files. Vite's development fallback was not evidence that this worked in the release image.
- A live cold-browser check exposed a separate initial-cookie race: missing assets such as `/favicon.ico` could create an anonymous session concurrently with `/api/v1/session`. Missing resource requests now terminate before session middleware, and only the explicit session endpoint initializes anonymous sessions. A regression reproduces the prior failure; image checks also require missing resources and public directory reads to omit session cookies.
- MapLibre 6's separate worker must be bundled explicitly using its [Vite worker URL configuration](https://maplibre.org/maplibre-gl-js/docs/). The image verifier checks that the worker is shipped and served as JavaScript, and live browser checks reject failed application assets.

## Reference checks

- [Google shared-core machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines): verified with `gcloud` that Stockholm offers `e2-micro` with 1024 MiB and `e2-small` with 2048 MiB.
- [MongoDB WiredTiger memory](https://www.mongodb.com/docs/manual/core/wiredtiger/): 0.256 GiB minimum internal cache; this is only part of database memory use.
- [Google deployment federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines): restrict immutable repository/owner IDs, trusted workflow, main ref, event and environment.
- [Caddy basic authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth): HTTPS and a hashed password protect the preview.

## Recorded execution evidence

The first successful release is [run 41294375648](https://github.com/xLeitix/theflock/actions/runs/41294375648), commit `10000c707bd9707d4a14317f526bb94460ab42a9`. Source checks, publication, exact-image tests, KMS signing, constrained IAP deployment and the 60-second health window completed. Its deployment attempt initially rejected Docker's differing `Id` semantics; the operator corrected the verifier to check explicit OCI identities and reran the failed deployment job successfully. The later signing implementation uses the same explicit config-digest extraction on the runner.

Authenticated browser checks at 390×844 and 1440×1000 verified rendering, demo login, named history and a fictional feeding visible after logout/reload, with no page errors or horizontal overflow. Native local DNS retained a negative cache, so these browser checks used the already-verified static address as a hostname-resolution override while retaining normal TLS hostname/certificate validation. Authoritative DNS, Google DNS and Cloudflare DNS resolved the public name correctly; GitHub independently reached its HTTPS authentication challenge without an override.

The running app used approximately 98 MiB inside its 256 MiB container limit; the 958 MiB usable-RAM VM had about 400 MiB available. No kernel OOM event was recorded. About 88 MiB of cold pages remained in swap after provisioning; five one-second steady-state samples showed zero swap-in/out. This supports this small fictional-data preview on an `e2-micro`, not a production capacity or throughput claim.

Subsequent local validation passed 34 API/runtime tests, seven browser workflows, frontend typechecking/build and server compilation. The new delayed-session regression failed before the session-generation/cookie fix and passed afterward, including a full reload with the authenticated cookie. The release-image checks now also require `/emergency` to serve the compiled frontend. The latest release workflow remains the authority for whether these later changes have reached the VM.

Cold-browser investigation then reproduced anonymous cookie issuance on missing resources. The added regression failed before the restricted session-bootstrap fix and passed afterward; the expanded local suite passed all 35 API/runtime checks and seven browser workflows. The production build now includes the explicit map worker, and release-image tests verify its HTTP availability and JavaScript content type.

The VM helper rejected a digest inconsistent with the signed eligibility record before changing the app. A same-image fault injection then forced candidate readiness to fail: the helper restored the prior running release, verified health, preserved the current-release record and cleared the pending journal. This exercised rollback control flow without claiming a cross-version database migration rollback test.

A populated backup was downloaded by the operator and restored into a fresh `flock_restorecheck_<UUID>` database, which no application serves. Counts matched the live preview: four places, 17 feedings (16 fixtures plus one identified browser-test feeding), three care cases, three care events and four demo users. The schema marker and geospatial index were present. Only that temporary restore database was removed afterward. This verified the logical preview collection restore and indexes; it did not rehearse full-instance/oplog disaster recovery or production account erasure.
