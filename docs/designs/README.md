# Flock design package

Start with [the integrated design](flock-design.md) and the current [community-care revision](../development/community-care-revision.md). They define public attribution/comments, two roles, dated care commitments, combined activity, immediate resolution and geolocation-assisted places, alongside the production architecture.

## Current supporting documents

- [Integration decisions](decisions.md)
- [Requirements and mockup context](brief.md)
- [Development plan](../development/prototype-plan.md)
- [Implementation/design validation ledger](../development/design-changes.md)
- [Provider evidence and verification limits](provider-evidence.md)
- [Mockup inventory](mockup-inventory.txt), [mobile reference](reference/map-mobile.png), [desktop reference](reference/map-desktop.png)

## Historical specialist proposals and reviews

The five [specialist proposals](specialists/) and [original independent review](reviews/flock-20261030/resolutions.md) are preserved historical snapshots. Their anonymous feeding, private-note, approved-helper and separate-bird-location proposals are superseded by the current design. Do not use them as an implementation contract where they disagree. The [prototype review](../development/prototype-review.md) records acceptance of the earlier local milestone; it does not certify this later revision. The fresh [community-care design review](../development/community-care-design-review.md) accepted the corrected revision for implementation; execution validation is separate.

## Implementation status

A local Vue/Express/MongoDB prototype runs at http://127.0.0.1:4173; README contains actual commands and limits. The current revision passed independent design and implementation reviews,30 API/runtime tests and6 browser workflows; see [execution evidence](../development/community-care-validation.md). GitHub source/CI is a separate delivery step; GCP/Facebook/DNS deployment is not implemented. The original `Pigeon Tracker.html` remains unchanged.
