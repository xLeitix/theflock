# Architecture design review standard

A fresh engineer should understand intended behaviour, core API/data/security contracts, implementation sequence, risks, alternatives and verification requirements without inventing major architecture. Check:
- User constraints: Vue/Bootstrap, Express, self-hosted MongoDB on same Google VM, public GitHub, actual test/deploy main automation, specified domain, Facebook, local testability, no instant messaging.
- Mobile/desktop mockup fidelity and intentional privacy changes; complete user states.
- Exact/public projection boundaries, roles, concurrent revocation, uploads, deletion/restoration, and realistic Facebook trust assumptions.
- Same tested image can run in CI and production with no shipped authentication bypass.
- CI permissions and GCP credentials are feasible, deploy logic handles failures/races/rollback, database/storage preserved.
- Backup/media/deletion-ledger retention and restore are consistent; same-VM limits are candid.
- Tests are meaningful observable gates with live-provider verification separate from stubs.
- Material choices decided or explicitly gated, viable alternatives discussed.

Blocker prevents safe/correct implementation of the stated design. Major is a material contract/verification/design gap. Nit is a local improvement without meaningful behavioural impact. Do not mark missing credentials or unperformed tests as failures where the design explicitly reserves these for implementation, but flag an impossible or contradictory planned test. No runtime certification is possible in this review.
