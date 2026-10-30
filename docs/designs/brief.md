# Flock design brief

The [integrated design](flock-design.md) and [community-care revision](../development/community-care-revision.md) are current implementation authority. The original design was developed by five specialists and a separate reviewer; historical proposals/reviews remain evidence, not current instructions where superseded. A running local prototype now exists. The user requested a further design revision, independent re-review, then implementation.

## Confirmed requirements

- Mobile-first Vue/Bootstrap website, desktop supported, initially close to `Pigeon Tracker.html`.
- Express backend and self-hosted MongoDB on the same Google Cloud VM; Atlas is superseded.
- Public GitHub source, actual Actions tests/deploy on main, live host `theflock.icet-lab.eu`; GitHub Pages is not the runtime.
- Facebook login in production, security/encryption/authentication and practical local testing.
- Two roles only: normal member and moderator. Any member may commit to a care report with a planned date; no helper approval or two-hour lease.
- Public display names and new comments in a combined feeding/bird-care activity log. A handling action can include a public comment. Legacy private content is not automatically published.
- Bird reports belong to public places; no separate bird coordinates or participant-only report detail. Optional immediate resolution when reporting something already handled.
- Browser geolocation helps choose a new place, with manual fallback and confirmation before publishing the point.
- English/Swedish and Gothenburg, Sweden; Europe/Stockholm dates. Demo places: Coop Eriksberg, Vårväderstorget, Friskväderstorget and Järntorget, with fictional feeding history.
- Instant messaging remains excluded. No dispatch, push notification or qualification claim is implied.

## Mockup and architecture context

The original mockup has20 artboards covering map, place, feeding, care, directory and language flows; messaging boards are excluded. Preserve map-first hierarchy, purple actions, recency markers, magenta care badge, mobile sheet and desktop panel. See [inventory](mockup-inventory.txt) and reference images. The source mockup remains untouched.

MongoDB uses a private authenticated single-node replica set with durable storage, verified production transport and off-VM backups. Same-origin Express serves built Vue/API/auth through a TLS proxy on GCE. A private GCS bucket can hold future photos, but visible-report photos are served through a visibility-checked public API; no direct object exposure. Local HTTP/demo login are a bounded fictional-data prototype exception, not a production solution.

## Current delivery boundary

Revise and independently review the public-activity/community-care contract before implementation. Validate state races, migration publication safety, dated commitments, immediate resolution, combined activity and geolocation permission/late-response behavior. Real Facebook, photos, account lifecycle administration, GitHub/GCP deployment, production TLS/backups and verified emergency contacts remain later prototype milestones. Do not present those as implemented or invent approvals/pricing/credentials.
