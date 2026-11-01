# CI and production deployment starting point

**Superseded delivery status, 1 November 2026:** the original no-deployment scaffold below is retained as historical evidence. The user has now authorized a password-protected preview in a separate project. [Release preview](../../.github/workflows/release.yml) replaces `cd-readiness.yml`, calls CI on main pushes and implements image verification, signed eligibility and VM deployment. See [cloud-preview.md](cloud-preview.md) for the current contract and validation. The full public-production prerequisites below remain outstanding.

The public source repository is `xLeitix/theflock`. The live production target remains a Google Cloud VM running Express, the Vue/Bootstrap frontend and a local authenticated MongoDB replica set, served through HTTPS at **theflock.icet-lab.eu**. The current application is a local prototype with simulated identities and a deliberate production-startup refusal. It must not be made public as a deployed service.

## Working CI

[CI](../../.github/workflows/ci.yml) runs on every push to `main`, every pull request, and manual dispatch. It uses the same commands as local development:

1. Check out the tested revision without persisting GitHub credentials; install Node.js 24 and run `npm ci` against the lockfile.
2. Download the official MongoDB **7.0.31 Ubuntu 22.04 x86_64** binary and verify its hard-coded SHA-256 before extracting it. The installer exports `FLOCK_MONGOD`; it never installs a system database service.
3. Install the lockfile's Playwright Chromium and Ubuntu browser dependencies. Start real MongoDB with authentication, a keyfile, replica set `rs0`, loopback binding and random per-run credentials. The existing launcher creates separate least-privilege `flock_dev` and `flock_test` users/databases.
4. Run TypeScript/Vue typechecking, the API/runtime tests and the frontend build. Start and seed the detached app, then run the six browser workflows covering mobile, desktop and deterministic geolocation outcomes.
5. Always attempt the launcher's ownership-checked shutdown, including after test failures. The runner is disposable; no database/cache directory is reused between jobs.

All jobs have timeouts. CI cancels superseded runs for the same branch/ref and uses only `contents: read`; fork pull requests receive no deployment identity or application secrets. The npm download cache contains no MongoDB state. Dependencies and the three official GitHub actions are pinned through the lockfile and full commit SHAs respectively. Action release tags and MongoDB archive/checksum were checked against their official publishers on 2026-10-30.

Action logs contain the test reporter output. Artifacts retain the successful frontend preview bundle and allowlisted browser PNG screenshots for seven days. No `.local` runtime JSON, database files, keys, server logs, Playwright traces, cookies, backup or environment files are uploaded. The preview bundle is **not** a tested production container or deployable Express service.

The workflow requires no repository secrets or variables to run. Enable GitHub Actions for the repository; branch protection should require the `Typecheck, real MongoDB, build and browser tests` job before merging. Local equivalents remain `npm ci`, `npm run dev:setup`, `npm run typecheck`, `npm test`, `npm run build`, `npm run dev` and `npm run test:e2e`; stop with `npm run dev:stop`. Native MongoDB installation and local browser prerequisites are described in the root README.

## Explicit deployment boundary

The original `cd-readiness.yml` listened for successful CI runs on a **push to this repository's main branch**. Failed CI, PR runs, forks and manually dispatched CI did not enter the readiness job. It used no checkout, artifact execution, cloud credential or cloud API call. Its summary named the tested commit and said **Not deployed**. This scaffold is now replaced by the limited preview release workflow above.

Keep repository variable `FLOCK_DEPLOY_ENABLED` unset or `false`. Setting it to the exact value `true` deliberately fails the readiness job with a production-not-implemented error. This is a fail-closed scaffold, not a deployment switch that exposes the demo. A successful readiness job means only that deployment was deliberately left disabled. There is currently no production Dockerfile, release image, VM deployment helper or automated rollback to invoke.

The [production design](../designs/flock-design.md), as amended by the [community-care revision](community-care-revision.md), defines the later release implementation. Before replacing this guard, implement and review:

1. Real Facebook OAuth and callback validation, production session/CSRF/security configuration, runtime secrets, public content/moderation/data-erasure behavior, and the remaining production acceptance requirements. Preserve the simulated-auth refusal outside the local demo.
2. A production container and exact-image integration/security tests with external-service protocol doubles. Build once, test that image, publish it to Artifact Registry and deploy by immutable registry digest. Verify the pulled image's config digest; do not confuse config and registry-manifest digests. Produce SBOM/provenance and a signed deployment-eligibility attestation for the tested commit/digest.
3. Reviewed release workflows with minimal separate publishing, verification and deployment identities. Grant `id-token: write` only to the jobs needing Google Workload Identity Federation (WIF); never introduce a service-account JSON key. Pin a reviewed reusable release workflow by full SHA. Restrict federation by immutable repository/owner IDs, trusted workflow identity, `refs/heads/main`, push event and the designated environment. The current `workflow_run` readiness job has no cloud trust; introducing privileged deployment requires a reviewed trigger/trust design, such as a trusted main-push caller whose deploy job needs successful tests and image verification.
4. A pre-provisioned VM with encrypted disks, non-public MongoDB, least-privilege application/database users, Caddy HTTPS, Secret Manager access, verified backups/restore, monitoring and systemd services. Configure DNS for `theflock.icet-lab.eu`. This repository currently provisions none of these resources.
5. A root-owned, reviewed VM helper reached through IAP and OS Login. Its interface must accept only a validated commit and digest from the fixed approved registry, verify signed eligibility, and never execute arbitrary scripts from a checkout or give CI unrestricted root/Docker access. Use a deployment lock, disk/memory/backup/schema preflight and a private candidate slot.
6. Serialized releases with `cancel-in-progress: false`; recheck current main SHA immediately before deployment and inside the VM lock. Record superseded commits as skipped, not deployed. Use readiness checks, atomic proxy switch, drain and retained old assets, a durable rollout journal and a 60-second health window. Verify both HTTPS health and served commit after switching. On failure restore the previous image/upstream, verify recovery and fail the action; failed rollback needs an alert/maintenance path.
7. Compatible migrations and explicit rollback boundaries. The prototype's one-time community-care cutover is not evidence of N/N-1 production migration compatibility. An incompatible migration needs a separately reviewed maintenance/restore procedure.

## Configuration reserved for the production implementation

These names define the intended configuration contract. Only `FLOCK_DEPLOY_ENABLED` is read by today's scaffold; adding the other values does not activate deployment.

| Scope | Name | Intended value |
| --- | --- | --- |
| Repository variable | `FLOCK_DEPLOY_ENABLED` | Unset/`false` until a reviewed production pipeline replaces the guard. |
| Production environment variable | `GCP_PROJECT_ID` | Project containing the production resources. |
| Production environment variable | `GCP_PROJECT_NUMBER` | Numeric project identifier used in WIF provider resource names. |
| Production environment variable | `GCP_REGION` | Artifact Registry/related regional resources. |
| Production environment variable | `GCP_ZONE` | Compute Engine VM zone. |
| Production environment variable | `GCP_INSTANCE` | Existing production VM name. |
| Production environment variable | `GCP_ARTIFACT_REPOSITORY` | Existing repository name; derive the fixed image path as `REGION-docker.pkg.dev/PROJECT/REPOSITORY/theflock`. |
| Production environment variable | `GCP_WIF_PROVIDER` | Full `projects/NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` resource. |
| Publish environment variable | `GCP_PUBLISH_SERVICE_ACCOUNT` | Restricted image-publishing service-account email. |
| Verify environment variable | `GCP_VERIFY_SERVICE_ACCOUNT` | Separate verification/attestation service-account email. |
| Deploy environment variable | `GCP_DEPLOY_SERVICE_ACCOUNT` | Restricted IAP/OS Login deployment service-account email. |
| Production environment variable | `FLOCK_PUBLIC_ORIGIN` | `https://theflock.icet-lab.eu`. |

Create explicit GitHub environments for `production-publish`, `production-verify` and `production-deploy`, each with the relevant non-secret variables and suitable deployment-branch restrictions. Bind each identity to its exact trusted workflow/environment; use required reviewers if the owner chooses an approval gate. These environments do not exist merely because they are documented here.

No long-lived GitHub secret is required by the intended WIF design. Facebook application secret, MongoDB application/admin credentials, session signing secrets and storage credentials belong in the selected Google Secret Manager/VM runtime arrangement, not repository variables or CI artifacts. Decide and document actual Secret Manager resource names, IAM roles, attestation trust policy and the fixed VM-helper command when implementing production. The browser-exposed Facebook app ID is configuration; its secret never enters the frontend bundle.

## Validation record

The local prototype's current test evidence is in [community-care-validation.md](community-care-validation.md). Workflow syntax passed actionlint; pinned upstream revisions and the installer checksum were verified. Both branches of the deployment guard were exercised: disabled succeeds with “Not deployed”; an attempted enable fails without deploying.

The first application commit, `a2b16f62dab95facd8162ae6e508216900328639`, passed [GitHub CI run 41139178703](https://github.com/xLeitix/theflock/actions/runs/41139178703) on 30 October 2026. The Ubuntu 22.04 / Node.js 24 runner successfully installed and started authenticated MongoDB, typechecked, passed all 30 API/runtime tests, built the frontend, passed all 6 Chromium workflows, stopped its owned services and uploaded the allowlisted artifacts. This verifies the CI starting point on a real GitHub runner; it does not establish production deployment success.

The follow-on [CD readiness run 41139358030](https://github.com/xLeitix/theflock/actions/runs/41139358030) also succeeded through the disabled guard. No cloud deployment occurred.
