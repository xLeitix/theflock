# Integration decisions

The integrated [flock-design.md](flock-design.md) is authoritative. Specialist files are preserved proposals, including alternatives that were not adopted. This log records current integration choices. The later [community-care revision](../development/community-care-revision.md) supersedes the original anonymous/private/approved-helper model; historical specialist and review snapshots remain unchanged.

| Topic | Selected design | Reason / alternatives |
|---|---|---|
| Database | Self-hosted MongoDB on same GCE VM | Latest user correction overrides original Atlas request. |
| Pilot region | Gothenburg, Sweden | User confirmed; Europe/Stockholm and EN/SV, verified regional directory. |
| Live hosting | GCE VM; GitHub for public source and Actions | User confirmed; GitHub Pages cannot serve Express. |
| Public access | Public place pins, display names and comments | Latest user instruction supersedes anonymous public activity; internal/provider IDs remain excluded. |
| Visual fidelity | Preserve reference tokens, map/sheet/panel hierarchy | Source CSS inspected and mobile/desktop mockups rendered. |
| Messaging | Remove entire feature and notification promises | Explicit v1 exclusion; structured care states remain. |
| Care photos | Future optional photo through visibility-checked public API | Bucket stays private; visible reports are public. Image implementation remains deferred in the prototype. |
| Feeding time | Retain Change time, bounded backdating | Keep mockup capability; reject future manipulation and distinguish commit time. |
| Public time | Coarse Gothenburg calendar dates and computed age categories | Security proposal preferred over backend exact public instants; opaque IDs/encrypted cursors prevent trivial hidden-time leakage. |
| Public identity | Current display name on eligible public contributions; no provider/internal ID | User explicitly requested named feeding history. Legacy attribution stays withheld except allowlisted synthetic records. |
| Bird location | Public shared place only | User clarified birds belong to places; remove separate bird coordinates and participant-only report detail. |
| User roles | Normal member and moderator only | Any active member can commit to care; no approval/capability or helper grant endpoint. |
| Care commitments | Dated assignment, no automatic lease expiry | Claim requires planned Stockholm date today or later; overdue is labelled, not silently released/resolved. |
| Public comments | New place/feeding/care/action comments public | Explicit fields and publication metadata prevent old private notes/reasons/descriptions from leaking. |
| Combined activity | Feeding records plus structured care events | Event actor/date/comment shown; care events do not update feeding recency. |
| Immediate resolution | Atomic resolved report plus reported_resolved event | Handles an already-completed situation without a temporary open report or duplicate log entry. |
| New-place location | Browser geolocation proposal plus manual fallback/confirmation | Handle permission, timeout, accuracy, bounds and stale callbacks; no automatic publication or background tracking. |
| Recency | 48h/96h elapsed thresholds plus unknown | No-history is not evidence of hunger; use honest wording. |
| Flock bands | 1–14 / 15–50 / >50 / unknown | Resolve overlapping English mockup labels; zero observation cannot log a feeding. |
| Cached summaries | Indexed read-time derivation initially | Avoid repair complexity/races of denormalized latest-feeding fields; retain load-test gate. |
| Map engine | MapLibre + MapTiler, behind adapter | Branded quiet style; separate list fallback; provider contract/quota checked before launch. No geocoder v1. |
| API names | /api/v1/care-cases, /emergency-contacts, /me | Main document normalizes differing specialist route proposals. |
| Media storage | Private GCS bucket, visibility-checked API stream | Public visible-case media remains removable; original bytes discarded and direct object URLs withheld. |
| Retention | Public care text persists until moderation/account deletion or a later explicit retention policy | No new30-day private-detail expiry. Legacy purged cases remain terminal; backup/erasure schedules continue. |
| Restored privileges | Reset moderator roles and care assignments | Prevent restoring an old authorization snapshot; helper role no longer exists. |
| Session | Server-side Mongo session; 24h idle/7d absolute | No browser bearer JWT; current account status governs every private request. |
| Elevated action | Fresh bound Facebook identity confirmation | Do not falsely equate a new redirect with forced password/MFA reauthentication. |
| Local vs release tests | Local-only adapters; external protocol doubles for exact release image | Keep fake login code out of production while testing the same immutable image later deployed. |
| Deployment order | All main pushes test; stale/superseded releases skipped explicitly | Prevent delayed old pipelines rolling back newer code; GitHub concurrency is not an every-SHA deployment queue. |
| Review scope | Original five-agent design and later fresh revision review | Old reports remain snapshot evidence; current public-care revision receives a new independent review before implementation. |

## Delivery and recovery integration details

- Use a host token-minter and read-only token directory for short-lived GCS access, with no application ADC/metadata fallback. Separate app, backup and retirement identities.
- Explicitly allow certificate-free TLS clients for SCRAM, while requiring encrypted transport and validated Mongo server certificates.
- Pin reusable workflow identity as well as action/image dependencies. Record Docker config digest separately from registry manifest digest, and verify the final pulled registry image before deployment.
- Run backups every four hours with a one-hour completion budget; measure recoverable capture age against the six-hour RPO target, not archive upload time.
- Database backup eligibility is35d with a37d monitored purge target; noncurrent media38d with a40d purge target after retirement. Account active erasure target24h therefore differs from up-to41d recovery-copy purge target. GCS lifecycle delays are monitored rather than represented as exact deletion guarantees.
- Gothenburg public dates use Europe/Stockholm calendar bucketing, rather than the security specialist's initial UTC-date suggestion, to match the pilot's user-facing day boundaries without exposing precise times.

## Independent-review corrections

All three Major findings were accepted and corrected: account erasure fences every owned write/async finalization; hidden-parent visibility applies to direct child reads and mutations; purged care data makes old cases nonreopenable. See the review resolution ledger for evidence and verification limits.

## Current migration boundary

The known synthetic record IDs may be republished with demo names/comments. Arbitrary prior records remain anonymous with old private text withheld, including records entered by a person through a demo account. New writes carry explicit public text/attribution metadata. Remove obsolete helper capabilities and invalidate affected sessions; return legacy lease-based claims to open once, without inventing a future commitment or attributing a system migration to a person. Serialize migration with case version/fences and preserve old purge tombstones. New dated commitments and new public strings must not be reset by a rerun.
