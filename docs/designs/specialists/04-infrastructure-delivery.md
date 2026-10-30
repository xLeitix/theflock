# Specialist 04 — infrastructure and delivery

> Historical proposal: the current [integrated design](../flock-design.md) and [community-care revision](../../development/community-care-revision.md) supersede anonymous attribution, private contribution notes, approved-helper roles and separate bird coordinates below. This snapshot is retained as earlier design evidence.

Status: design proposal, 30 October 2026; no infrastructure, workflows, credentials or application code have been created.
Scope: public GitHub source; Express serves built Vue/Bootstrap assets on `theflock.icet-lab.eu`; Express and MongoDB share one Google Cloud VM.
The integrated design is authoritative; this proposal replaces its underspecified identity, release and recovery mechanics.

## 1. Deployment topology and capacity

- Use one supported Linux GCE VM in an operator-selected EU region, a reserved regional external IPv4, and a separately managed persistent data disk.
- Start capacity planning at 2 vCPU/8 GiB RAM and ≥50 GB balanced data disk; neither sizing nor cost has been measured or approved.
- Caddy terminates HTTPS; two independently managed application slots support candidate validation; one persistent MongoDB container supplies `rs0`.
- Vue is compiled into the Express image. GitHub Pages, Atlas, a second database VM and Kubernetes are outside this design.
- Create persistent `flock-edge` and `flock-db` Docker networks during bootstrap; use stable `mongo.internal:27017` replica-set discovery on the database network.
- Only Caddy publishes host ports 80/443. MongoDB publishes no host port; candidate probes run through a fixed root-owned network probe helper.
- App slots join both networks; Caddy joins only edge; Mongo and temporary migration/backup jobs join only database. Decoder has no network.
- Separate infrastructure and application Compose projects; an application release operates only its named slot with `up -d --no-deps` and never runs infrastructure-wide `up` or `down`.
- Initial hard memory ceilings: Mongo 3 GiB, WiredTiger cache 1.25 GiB, each app 768 MiB, decoder 256 MiB, Caddy 128 MiB, token minter 96 MiB.
- Set Node heap below its container ceiling, initially 384 MiB; bound connection pools, request bodies, tmpfs, process counts and image-decoder concurrency to one.
- A temporary restore verifier is capped at 1.25 GiB with a deliberately smaller cache; backup/deploy/restore-heavy work shares a host maintenance lock.
- CPU quotas prevent decoder/backup starvation of the API; reserve at least 1.5 GiB for kernel, filesystem cache and host agents. Validate actual simultaneous peaks.
- Retain the data disk when deleting the VM. Mount by UUID at `/srv/flock-data`; pin Mongo `dbPath` beneath that mount, never an image layer.
- Before Docker/Mongo startup, systemd verifies the expected filesystem UUID, mounted device and root-owned volume-identity marker; bind mounts use `create_host_path: false`.
- A missing, replacement or empty disk is a startup failure. Only a separate explicit initial-bootstrap command may initialize a new volume; reboot must never silently create an empty production database.
- Persist Caddy certificate state and Mongo data independently of application slots; encrypted-at-rest cloud disks do not protect data from VM root.

## 2. DNS, HTTPS and network controls

- DNS `A theflock.icet-lab.eu` points to the reserved address; publish no AAAA until working IPv6 routing, firewall and certificate validation are demonstrated.
- Permit inbound TCP80/443 publicly; TCP22 only from IAP TCP forwarding's documented `35.235.240.0/20` range; remove permissive default SSH rules.
- Enable OS Login; disable project/instance SSH-key access where OS Login supersedes it. Use named operator identities, MFA and a documented break-glass route.
- Caddy's exact site name is the production hostname; persist `/data` and `/config`, permit outbound DNS/HTTPS, and verify CAA records do not block the selected ACME issuer.
- Test HTTP challenge/HTTPS redirect and certificate renewal against staging before production issuance; DNS, routing and public challenge reachability are real launch gates.
- Reload validated Caddy configuration atomically; keep the admin endpoint local or on a root-owned Unix socket, never on the application network/public interface.
- Set HSTS after successful HTTPS verification; preserve health/version routes and exclude `/api` and `/auth` from SPA fallback.
- Default-deny container access to metadata IPs, including `169.254.169.254` and IPv6 equivalents if enabled; block DNS aliases by blocking their resolved destinations.
- Install forwarding rules compatible with the chosen Docker firewall backend before services start; host OUTPUT rules also deny metadata to nonprivileged host users, including the deployment login.
- Test metadata denial from both slots, decoder and login shell after reboot. A host firewall claim without these tests is insufficient.
- Permit only necessary service communication; prevent app access to Docker socket, host PID/network namespaces, privileged devices, token-minter control and Caddy administration.

## 3. Concrete GCS credentials while metadata is blocked

- Attach a dedicated `vm-host` service account, using the cloud-platform OAuth scope and narrowly granted IAM permissions; never use the default Compute Engine service account with broad project roles.
- A root-owned systemd `flock-token-minter` is the only application-support process allowed to obtain metadata OAuth access tokens; it has fixed configuration and no public or app-callable API.
- Every five minutes it obtains the VM OAuth access token, then calls IAM Credentials `generateAccessToken` for a fixed `app-storage` account with `lifetime: "600s"` and the storage read/write OAuth scope.
- Grant `vm-host` a custom role containing only `iam.serviceAccounts.getAccessToken` on that named target, rather than general service-account administration. IAM, not OAuth scope alone, limits object operations.
- The host also has repository-scoped Artifact Registry read and the selected Secret Manager access needed by fixed root maintenance; those broader host capabilities never appear in the token issued to Express.
- `app-storage` has custom object get/create permissions on the private media bucket and object create only on the deletion-ledger bucket; no object list/delete, bucket mutation, secrets or registry access.
- Write the returned `accessToken` and `expireTime` atomically into `/run/flock/app-storage/token.json`, mode0440, root-owned with an app-only numeric group; token material stays in tmpfs.
- Read-only bind-mount the containing directory into both app slots; mounting one file would retain the old inode after atomic replacement. Do not mount it into decoder, Caddy or Mongo.
- The storage adapter rereads the file before requests when its mtime changes, checks ≥60 seconds validity, and uses `OAuth2Client.setCredentials({access_token, expiry_date})` plus `getRequestHeaders()` for fixed-host GCS JSON API requests.
- Streaming uploads/downloads use those headers; no browser receives them. There is no refresh token or ADC/metadata fallback in the app; an expired/missing token yields a retryable media error and an operator alert.
- A 401 reloads the token once and retries only a generation-conditioned/idempotent operation; never repeat a non-idempotent mutation blindly. No token or authorization header enters logs.
- Apply the same minter pattern to separately owned backup-writer and media-retirement job directories; each target account has different bucket permissions and each task receives only its own directory.
- Minters, secret bootstrap and approved host maintenance are trusted host components. VM root can obtain every attached-identity capability; ordinary container isolation is not a boundary against root or kernel compromise.
- A stolen app token exposes existing private media and can create objects for its short lifetime; authorization in Express and database access controls remain necessary. No runtime JSON service-account key is required.
- Alternative: a narrow Unix-socket GCS operation gateway avoids bearer tokens in Express but adds a custom security service. The file-fed token approach is the selected, testable v1 design.
- Provider basis: [IAM Credentials token API](https://docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken); endpoint behavior is documented, while timers, file permissions and failure policies above are Flock choices.

## 4. MongoDB and secret bootstrap

- Pin a supported MongoDB release, compatible tools, image digests and OS packages; maintain feature-compatibility version deliberately across upgrades.
- Production Mongo uses `replication.replSetName: rs0`, `security.authorization: enabled`, `security.clusterAuthMode: x509`, and `net.tls.mode: requireTLS`.
- Provide verified CA, server leaf certificate/key, and membership leaf/key via read-only files; SAN includes the advertised `mongo.internal` hostname and the explicitly used localhost bootstrap hostname.
- Separate cluster-member certificate material from client credentials; require correct membership subject attributes and certificate usages, and never distribute the member key to Express.
- SCRAM-SHA-256 clients without client certificates require explicit `net.tls.allowConnectionsWithoutCertificates: true`; this permits certificate-free TLS clients, not anonymous database operations or invalid server certificates.
- App verifies CA/hostname, authenticates with its own SCRAM user, and has CRUD privileges only on required application/session collections; migrations, backup, cleanup and administration use separate users.
- Initial bootstrap runs in an isolated database namespace: initialize `rs0`, use the documented localhost exception to create the first administrator, create restricted users/indexes, then verify unauthenticated and wrong-role denial.
- Keep admin credentials unavailable to application images. Disable production fake-auth adapters; startup rejects placeholder secrets, missing CA files or incompatible database schema.
- Secret Manager contains individually scoped Facebook/session/runtime database/leaf-key secrets. `vm-host` can access only those needed secret resources, not the private CA signing key or recovery operator secrets.
- Root bootstrap fetches explicitly selected secret versions into per-service `/run/flock/secrets` directories with numeric ownership; the release manifest records version IDs, never secret values.
- Do not put secret bytes in cloud-init metadata, GitHub variables, Docker build arguments, image layers, command-line URIs, checked-in environment files or workflow logs.
- Keep CA signing material encrypted under a separate operator-controlled recovery identity, outside the VM's access. Store offline recovery instructions and credential ownership independently of the data backup.
- Rotate runtime SCRAM users by overlap: create replacement, deploy new secret version, drain old slot, revoke old user. Session signing keys use an explicitly bounded overlap ring.
- Alert certificate expiry at30/14/7 days; rehearse leaf/CA overlap and supported reload behavior for the pinned Mongo version. A required Mongo restart is scheduled maintenance, never an app-release side effect.
- References: [Mongo X.509 membership](https://www.mongodb.com/docs/manual/tutorial/configure-x509-member-authentication/) and [TLS client-certificate option](https://www.mongodb.com/docs/manual/reference/configuration-options/#mongodb-setting-net.tls.allowConnectionsWithoutCertificates).

## 5. Public repository and immutable federation trust

- Protect main with required tests, review and CODEOWNERS for workflows/ops/dependency policy; protect tags and forbid routine force pushes. A maintainer able to change trusted release logic is a production administrator in effect.
- Use GitHub-hosted ephemeral runners, immutable action commit pins and minimal per-job permissions. Untrusted PR jobs have `contents: read`, no OIDC, production environment, secrets or privileged caches.
- `pull_request_target` must never execute contributor code. Main publication consumes only artifacts from its own successful run and exact SHA, never artifact names fetched from arbitrary PR runs.
- `.github/workflows/release.yml` triggers on every `push` to main without path filters and calls a reviewed reusable `.github/workflows/release-core.yml` by full commit SHA.
- The pinned reusable workflow checks out the triggering application's `github.sha`; pinning workflow code must not accidentally build the workflow's older commit.
- WIF issuer/audience are fixed; map immutable `repository_id` and `repository_owner_id`, branch/ref, event, caller workflow ref, reusable workflow ref/SHA and environment claims.
- Provider condition requires exact repository/owner numeric IDs, `ref == refs/heads/main`, `event_name == push`, `runner_environment == github-hosted`, and the designated caller workflow path at main.
- Also require `job_workflow_ref` to identify the exact reusable workflow at its reviewed full commit and `job_workflow_sha` to equal that commit. A mutable workflow filename alone is not immutable workflow trust.
- Distinguish fixed `release-publish`, `release-verify` and `production` job environments in IAM principal bindings; none requires a human reviewer for normal successful main releases.
- Grant federation `roles/iam.workloadIdentityUser` on the corresponding publisher/verifier/deployer service account only; no repository-wide service-account token-creation grant.
- Publisher has Artifact Registry writer on one repository; verifier has reader there; deployer has only the SSH/IAP permissions below. Main application code cannot request an arbitrary identity/environment through workflow inputs.
- Updating the trusted reusable workflow SHA requires a reviewed infrastructure trust update; bootstrap establishes that pin before enabling production release events.
- Evidence: [GCP deployment federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines) and [GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc).

## 6. Actual pipeline contract

The following commands/scripts are implementation deliverables, not commands claimed to exist today; scripts must perform the stated checks and return nonzero on failure.
1. PR and main source gates: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, and required secret/dependency scans.
2. Integration uses disposable authenticated TLS Mongo `rs0`; E2E uses the production frontend build, fake OAuth/media adapters and deterministic tiles. No real provider secrets are needed.
3. A credential-free main build job runs `docker build --platform linux/amd64 --iidfile image.id -t flock-candidate .`; production VM architecture must match or the matrix must explicitly test its platform.
4. Run `npm run test:release -- --image flock-candidate`, runtime image scanning, production-startup rejection tests, privacy/role checks and migration compatibility tests before saving the image.
5. Save the same image with `docker save flock-candidate -o image.tar`; record tar SHA256, local image config digest, commit, test results and lockfile hash in a same-run artifact manifest.
6. Publisher checks the download artifact checksum/run/SHA, loads the image, confirms its config digest, tags it with the exact commit, then pushes to the fixed Artifact Registry repository. It never rebuilds.
7. Capture the returned registry manifest digest; local Docker image ID is a configuration digest, not the deployable registry digest. Record both rather than assuming equality.
8. A fresh verifier job pulls `REGISTRY/flock@sha256:...` and runs release acceptance against that exact digest. Any failed source, image or final-digest gate makes deployment ineligible.
9. Produce SBOM/provenance and a signed deployment-eligibility attestation binding registry digest, commit, successful workflow run and required gate outcomes; image-build provenance alone does not prove tests passed.
10. The production job has `needs` on every required gate, publication and digest verification; missing project/WIF/instance settings fail visibly. No silent missing-secret skip or placeholder deployment is acceptable.
11. It reads current main from GitHub, compares the candidate SHA, and invokes `gcloud compute ssh INSTANCE --zone ZONE --tunnel-through-iap --command 'sudo /usr/local/sbin/flock-deploy SHA DIGEST RUN_ID'` with strictly validated fixed-format arguments.
12. Record deployment success only after the host helper and external-origin smoke checks succeed. Upload diagnostics with secrets redacted on failure; issue no green deployment status merely because rollback succeeded.

## 7. Serialization, obsolete releases and SSH authority

- Use deployment concurrency group `flock-production` with `cancel-in-progress: false`; every push still executes its source tests independently.
- GitHub concurrency can replace an already pending run even with cancellation of the running job disabled; it does not promise FIFO delivery of every historical SHA.
- Interpret automatic delivery as every main push is tested and the newest successful current main is deployed; explicitly record superseded candidates. Deploying every intermediate SHA conflicts with stale-main rejection.
- Before SSH and again under host `flock` lock, compare candidate SHA against fresh GitHub main; check immutable repository ID and fail closed on API failure/rate limiting, never trust a cached branch head.
- Repeat the check immediately before Caddy switch. A new push can occur after that check; serialization ensures its later successful deploy wins, without claiming an atomic transaction spanning GitHub and the VM.
- Helper verifies the deployment-eligibility attestation, approved signer/reusable workflow, exact digest/SHA/run and successful required checks. Public repository APIs permit read-only verification without storing a broad GitHub token on the VM.
- Persist active/previous release records and a monotonic deployment journal; an old rerun cannot overwrite a newer applied release. Rollback is a separate operator action referencing an already verified release, not a bypass flag supplied by ordinary CI.
- Deployer receives instance-scoped `roles/compute.osLogin`, IAP tunnel access restricted to the intended instance/TCP22, and only required Compute project/instance read permissions for the chosen gcloud invocation.
- Deployer also needs `iam.serviceAccounts.actAs`, normally via `roles/iam.serviceAccountUser`, on the attached `vm-host` account; omitting this breaks OS Login to service-account-attached VMs.
- Do not grant `compute.osAdminLogin`, project Editor/Owner, Docker group membership, metadata mutation or infrastructure provisioning rights to deployment CI.
- Provision the fixed OS Login service-account username into sudoers for one root-owned helper. Validate exact argument count, 40-hex commit, sha256 digest, numeric run ID and fixed registry prefix; never eval caller strings.
- Helper uses root-owned Compose/templates, fixed mounts/UIDs/networks and bounded operations; it never accepts paths, arbitrary Compose files, shell scripts or environment overrides from an image/repository checkout.
- Run image-provided migration/application code only as unprivileged containers with narrow mounts/credentials; no Docker socket, `--privileged`, host network or executable host hooks.
- This reduces deploy capability but does not make Docker root-safe in general: arbitrary Docker access, helper replacement, host root or OS administrator access is root-equivalent and can reach all VM identities/data.
- References: [OS Login access requirements](https://docs.cloud.google.com/compute/docs/connect/ssh-best-practices/login-access), [IAP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding), and [GitHub concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments).

## 8. Candidate activation, migrations and rollback

- Acquire deployment/maintenance lock, verify mounted data identity, backup freshness, disk/free memory and retained previous release; defer heavy backup verification while a candidate overlaps production.
- Reject deployment without a verified recent backup, except the separately audited initial empty-database bootstrap. Keep current app serving when preflight fails.
- Pull by approved digest, create inactive slot with fixed limits and versioned secret/config references, then execute only known migration entrypoint from that image.
- Host administration creates a per-release Mongo migration user with required DDL privileges on the application database, mounts its temporary credential only into the migration job, and drops it on completion/failure.
- Mongo users do not automatically expire: a root watchdog and reboot reconciliation drop abandoned migration users and remove their tmpfs files; enforce job timeout independently of SSH connection lifetime.
- Migrations have IDs/checksums, explicit preconditions, resumable progress and N/N−1 read/write compatibility; `dbAdmin` is not given to the web process. Long backfills are bounded jobs, not startup blockers.
- Add fields/indexes before using them; postpone dropping/renaming schema until old binaries are retired and a separate maintenance release is reviewed. Code rollback never automatically downgrades data.
- Candidate readiness checks TLS/authentication, primary availability, schema/index version and reported commit/digest; liveness is separate and does not depend on Facebook or map-tile reachability.
- Validate Caddy configuration, recheck current main, atomically switch upstream and reload; record switch intent durably so reboot/SSH interruption can reconcile actual upstream with the journal.
- External smoke probes exact HTTPS hostname, certificate, version, frontend asset and read-only public API; observe errors/readiness for60 seconds and drain old requests before stopping its slot.
- Retain previous image/config/compatible secret versions and recent immutable assets; hashed JS files needed by already open pages remain available across switches instead of disappearing with the old container.
- On failed candidate, keep active upstream. On failed post-switch smoke, restore previous upstream and verify it; action still fails. Failed rollback activates a bounded maintenance response and alerts the operator.
- Run deployment as a named host systemd operation so SSH loss does not kill it mid-switch; reconnect reads its journal. Before another deployment, reconcile unfinished operations under the same lock.
- Never restart Mongo/Caddy containers, change replica configuration, prune volumes or run `compose down -v` during normal app delivery; Caddy configuration reload is the only proxy mutation.

## 9. Backups, media generations and deletion ledger

- Single-node `rs0` supplies transactions/oplog, not failover. Target RPO6h/RTO4h must be proven by timed restore, not inferred from scheduled jobs.
- Schedule full backups every4h, leaving margin for a ≤1h verified backup cycle; warn if newest verified off-VM recovery point exceeds5h and treat6h as a breached recovery objective. Measure age from recoverable capture time, never object upload time or file mtime.
- Use compatible authenticated tools and a secret config file: `mongodump --config /run/backup/tools.yml --oplog --archive=/scratch/db.archive.gz --gzip`; do not add database/collection filters incompatible with full oplog capture.
- Verify sufficient oplog history for the full capture and fail on rollover/inconsistent dump. Pin server/tool versions; never back up an uncoordinated live data-directory copy as the recovery authority.
- Under the maintenance lock, restore the completed archive with `mongorestore --archive=/scratch/db.archive.gz --gzip --oplogReplay` into a disposable network-isolated verifier with no external credentials.
- Extract the media reference manifest from that restored database, not an unrelated live query: record exact object generations/hashes, schema version, dump interval and server/tool versions. Verify every required generation exists.
- This verification consumes storage/CPU: require scratch room for archive plus restored database and headroom, cap duration/resources, then remove verifier files. Revisit VM sizing if measured dataset growth exceeds the budget.
- Upload archive, checksum, manifest and completion record to a separate private EU backup bucket under unique names with create-only permissions; an incomplete multi-object upload is not a successful backup.
- Backups have35-day retention and lifecycle eligibility at35d; target verified purge by37d, alert on overdue objects. Runtime writer cannot read/delete old backups or alter retention; restore/deletion authority belongs to separate operators.
- Media keys are random, immutable and never reused; uploads use `ifGenerationMatch=0`. Save returned generation/hash transactionally before marking media ready; app token cannot overwrite or delete objects.
- Enable Object Versioning for media. A separate host retirement job handles authorized deletionJobs using its own identity; deleting the live name without a generation archives the current generation instead of destroying it.
- Retirement uses the expected generation as `ifGenerationMatch`, not as a generation selector; reject mismatches. Readers always request the database-recorded generation after case authorization.
- Keep noncurrent versions for38 days after retirement (`isLive:false`, `daysSinceNoncurrentTime:38`); the margin covers35-day backups, backup-cycle duration and monitored cleanup delay. Old photo creation age is not a safe retention clock.
- Set soft-delete policy explicitly rather than silently inheriting a default; selected v1 uses no additional soft-delete window on these buckets and relies on version retention plus restricted deletion identities.
- Target actual media-version purge by40d after retirement and verify it; GCS lifecycle is asynchronous, so failure/overdue retention is an alert, not a falsely guaranteed exact destruction time.
- Hide deleted content and revoke sessions immediately; target active-store account erasure/media retirement within24h. Closed-case private detail/media is retired30d after closure, with reopening policy enforced before cleanup.
- Privacy copy must distinguish active removal from recovery copies: account deletion can leave inaccessible media recovery copies for approximately41d from request (24h retirement plus40d purge target); overdue failures are tracked and corrected.
- Store ledger tombstones outside normal Mongo backups for90d, containing internal user/content/media IDs, generations, operation ID and deletion time, but no names, Facebook IDs or private text.
- Before acknowledging completed erasure or physically purging source rows, append an immutable ledger object with `ifGenerationMatch=0`; failure leaves a visible pending deletion and retryable job, never a completed claim.
- Deleted IDs are never reused. Ledger append is idempotent; app can create but not read/list/delete ledger objects. Monitor age/backlog and protect ledger lifecycle independently of database restore.
- Provider basis: [GCS Object Versioning](https://docs.cloud.google.com/storage/docs/object-versioning) and [lifecycle conditions](https://docs.cloud.google.com/storage/docs/lifecycle); retention durations and additional margins above are proposed policies.

## 10. Restore, operations and evidence gates

- Monthly isolated drill rebuilds a VM from bootstrap, restores a selected35-day-window backup/oplog and exact media generations, then checks counts, indexes, referential integrity and authorized private-media reads.
- Before public traffic, fetch the current external deletion ledger and replay all applicable tombstones; missing/unreadable ledger blocks reopening. Remove expired care data according to current time, not backup time.
- Expire all restored sessions, OAuth attempts and exports, rotate session/DB secrets as appropriate, reconcile deletionJobs, and verify that deleted identities/photos cannot reappear. Restore is not complete at `mongorestore` exit0.
- Rebuild data before DNS/traffic switch; never auto-format an unknown disk. Record achieved RPO/RTO and destroy drill data, temporary users, verifier scratch and credentials afterward.
- Keep recovery-compatible application images/schema tooling for at least90d, excluding protected active/previous digests from registry garbage collection. Restore credentials/CA keys follow separate operator-controlled recovery.
- OS patches, Docker/Mongo upgrades, CA rotation and disk expansion are scheduled infrastructure maintenance with backups and rollback plans; single-VM maintenance can cause downtime.
- Monitor outside the VM: HTTPS/TLS, API error/latency, release SHA, replica/disk state, RAM/OOM, disk70%/85%, backup/ledger/token ages and credential expiry. An alert destination and responsible operator are launch requirements.
- Retain request logs30d and sanitized security/audit logs90d; redact query strings, identity, coordinates, notes, image data and tokens. Apply bounded local log rotation and separate access-controlled off-VM logging where configured.
- Launch evidence includes fork-PR credential denial, WIF wrong-repository/branch/workflow denial, metadata denial, app storage delete denial, real main deployment, supersession race, failed migration/health rollback and reboot recovery.
- Also prove DNS/certificate renewal, missing-disk refusal, actual Facebook login, private media authorization, token-expiry behavior, generation-preserving retirement,35-day restore plus ledger replay and measured resource headroom.
- Inputs remain owner/repo immutable IDs, licence, GCP project/billing/region, DNS control, operator identities, Meta app, map plan and alert destination. Costs, quotas and live configuration remain unverified.
- Material changes required in the parent: replace vague credential broker; add explicit SCRAM/TLS compatibility flag; distinguish image config/registry digests; pin reusable workflow identity; qualify every-SHA deployment; replace conflicting30d all-copy deletion promise.
