# Provider evidence and verification limits

Checked 2026-10-30. These references support provider capabilities; proposed application policies, sizing and recovery targets are design choices, not measured results. No cloud account, DNS record, Meta app, pricing quote or live deployment has been verified. agent-reach's configured Exa backend was unavailable; official documentation was read through the available web tool.

| Source | What was checked / implication |
|---|---|
| [Google Cloud deployment federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines) | GitHub OIDC can obtain short-lived GCP access. Restrict trust by immutable repository/owner IDs and branch; do not trust names alone. |
| [Google auth Action](https://github.com/google-github-actions/auth) | WIF is supported; use it rather than a long-lived service-account JSON key. Pin the action's reviewed commit at implementation. |
| [OS Login](https://docs.cloud.google.com/compute/docs/oslogin) | IAM controls SSH access. Login users can use VM-attached service-account permissions; document this trust boundary. |
| [SSH login access](https://docs.cloud.google.com/compute/docs/connect/ssh-best-practices/login-access) | OS Login requires actAs on an attached VM service account; scope that grant explicitly. |
| [IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding) | Encrypted administrative tunnel; permit TCP22 only from IAP's documented range, and remove broad default SSH firewall rules. |
| [GitHub secure workflows](https://docs.github.com/en/actions/reference/security/secure-use) | Minimal job token permissions, immutable action pins and isolation of untrusted PR code from privileged jobs. |
| [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) | Automatic certificates/renewal and HTTPS redirect; requires correct DNS and reachable challenge ports. Persist certificate state. |
| [Mongo replica-set authentication](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-with-keyfile-access-control/) | Internal membership authentication and client authorization are distinct. Current guidance recommends X.509 for production; keyfile is suitable for local development. |
| [Mongo TLS](https://www.mongodb.com/docs/manual/tutorial/configure-ssl/) | Valid CA-signed certificates and hostname SANs; internal CA is possible. Require verified TLS and certificate lifecycle management. |
| [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/) and [backup/restore](https://www.mongodb.com/docs/v8.0/tutorial/backup-and-restore-tools/) | Replica-set dumps support an oplog to capture writes during dump. Match restore tool/server compatibility; do not equate a raw live database directory copy with a consistent backup. |
| [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) | Public OSM tile capacity is limited and best-effort, with attribution/cache requirements. Do not design production around unlimited free tiles. |
| [MapTiler Cloud](https://www.maptiler.com/cloud/) | Offers hosted maps/styles; exact plan, quotas, referrer restrictions and terms are implementation-time launch checks, not an assumed free entitlement. |
| [Node releases](https://nodejs.org/en/about/previous-releases) | Production should use a supported LTS release. Pin a supported compatible Node release and exact lockfile/container digests during scaffolding; this design does not fabricate future patch versions. |

## Meta verification gap

The official [manual Facebook Login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/) and [data-deletion callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/) returned HTTP 429 during this run. The architecture specifies a server-side authorization-code login and signed deletion processing, but exact current Meta dashboard requirements, permitted redirect URIs for local testing, supported Graph version, public_profile access, app mode/review/business-verification requirements and callback behavior must be checked against the real Meta app before implementation sign-off. No claim of approval or verified end-to-end Facebook login is made.
