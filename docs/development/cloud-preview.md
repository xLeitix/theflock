# First Google Cloud deployment: protected preview

Status: implementation in progress, 1 November 2026. The user selected a separate Google Cloud project, retained `main` as the deployment branch and explicitly requested a password-protected preview before Facebook authentication. This is a new, limited deployment milestone; the full production requirements remain in the application design.

## Deployment contract

- Project `theflock-icet`, Stockholm `europe-north2`, initially an `e2-micro` with 1 GiB RAM. Validate actual memory use and application workflows before accepting that size. Build the application on GitHub, never on the VM. Bound MongoDB's WiredTiger cache to 256 MiB and the Node heap to 128 MiB.
- One VM hosts Caddy, authenticated MongoDB and the compiled application. MongoDB and Express listen only on loopback. A separate persistent data disk survives VM deletion; no deployment resets it. Use encrypted Google-managed disks, an off-VM backup and restricted service accounts.
- HTTPS `theflock.icet-lab.eu` requires a preview username/password before serving any application resource. Caddy overwrites a secret gateway header; Express independently rejects requests without it. Secure, HttpOnly, SameSite cookies and origin/CSRF checks remain mandatory. No public demo login is permitted.
- Simulated member/moderator selection remains available only behind this preview gate. Seed a new isolated `flock_preview` database with fictional data; do not upload the developer's database or sessions. The UI identifies the environment as a protected preview and requests fictional data only. Facebook and real-user production launch remain deferred.
- Pushes to `main` run CI, build an immutable container, test the container's preview boundary, publish a signed eligibility record, then deploy that exact digest through IAP and a constrained root-owned VM helper. Use GitHub OIDC / Google Workload Identity Federation, never service-account JSON keys. Publishing, verification and deployment have separate identities.
- Serialize deployments and reject stale commits both before remote invocation and inside the VM lock. Keep the prior image and restore it if candidate health fails. This 1 GiB preview uses a brief stop/start rather than simultaneous blue/green instances; a failed initial release leaves only the password-protected maintenance page. The schema is unchanged and incompatible migrations are refused.
- DNS is hosted by DigitalOcean. Add only the `theflock` record after allocating a static address; preserve the domain's nameservers and other records.

## Validation required before handover

Local typechecking, API/runtime regression tests and browser workflows; container build and preview-boundary tests on GitHub; actual main-push release; unauthenticated HTTP/HTTPS and forged gateway rejection; authenticated UI and write/read persistence; VM memory and service inspection; same-digest deployment repeat and rollback checks; backup archive and isolated restore verification. Record actual outcomes separately from intended controls.

## Reference checks

- [Google shared-core machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines): verified with `gcloud` that Stockholm offers `e2-micro` with 1024 MiB and `e2-small` with 2048 MiB.
- [MongoDB WiredTiger memory](https://www.mongodb.com/docs/manual/core/wiredtiger/): 0.256 GiB minimum internal cache; this is only part of database memory use.
- [Google deployment federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines): restrict immutable repository/owner IDs, trusted workflow, main ref, event and environment.
- [Caddy basic authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth): HTTPS and a hashed password protect the preview.
