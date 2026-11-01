# Flock local prototype

A Vue/Bootstrap and Express prototype for a Gothenburg pigeon-feeding map and bird-care workflow, backed by persistent MongoDB. Demo places use real public landmarks; all seeded observations and accounts are fictional. The design and current milestone are described in [the prototype plan](docs/development/prototype-plan.md) and [the design](docs/designs/flock-design.md).

A password-protected cloud preview is hosted at **https://theflock.icet-lab.eu** in the separate `theflock-icet` Google Cloud project. It uses its own fictional dataset. See the [cloud-preview deployment contract and operations notes](docs/development/cloud-preview.md); it is not the public Facebook-authenticated release.

The four demo places are **Coop Eriksberg**, **Vårväderstorget**, **Friskväderstorget** and **Järntorget**. Their approximate map positions use [Coop Eriksberg in OpenStreetMap via Mapcarta](https://mapcarta.com/N709070783), [Vårväderstorget in OpenStreetMap via Mapcarta](https://mapcarta.com/W181129307), [Friskväderstorget in Wikidata](https://www.wikidata.org/wiki/Q10499229) and [Järntorget in Wikidata](https://www.wikidata.org/wiki/Q6319995), checked 30 October 2026. These are demo pin positions, not verified bird locations. Bird reports belong to a public place; there is no separate bird coordinate.

Each demo place has four fictional feeding records, with varied flock sizes and food types. On first seeding, the most recent observation is about 12 hours old at Coop Eriksberg, three days at Vårväderstorget, five days at Friskväderstorget, and one day at Järntorget; older entries extend back up to six and a half days. Existing timestamps remain unchanged on later seeds, so records age naturally and are never duplicated.

## Run on this Mac

Prerequisites: Node.js 22.12–25 (Node 24 recommended), npm, and native MongoDB 7 or later. This checkout was prepared with Node 25.8.1 and MongoDB 7.0.31. The launcher looks for `mongod` under `/opt/homebrew/bin`, `/usr/local/bin`, and `/usr/bin`; use `FLOCK_MONGOD=/absolute/path/to/mongod` to override it. Docker is not required and its daemon is not started.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. The command starts MongoDB, idempotently seeds demo data, starts the API and Vite in the background, and returns only when both HTTP services are ready. It is safe to run again: an already-running owned app is reused, and stored observations survive restarts.

Choose **Log in**, then an ordinary member account or the moderator. Alex and Sam are two ordinary demo members with the same permissions; there are only two roles, member and moderator. There are no passwords or Facebook credentials. EN/SV language controls are available in the header.

New feeding and care activity shows the contributor's display name and public comments, including to visitors who are not logged in. Any member can commit to helping a bird on a planned date, add comments, and resolve a case they reported or are handling; moderators can intervene. A missed planned date is labelled overdue and does not automatically resolve the case. The combined activity log records feedings, care reports, commitments, comments and outcomes. Choose **Already handled** when reporting a situation you resolved immediately.

When adding a place, browser geolocation suggests a pin if permission is granted. You can retry with **Use my location**, edit coordinates or choose a pin manually. Confirm the public location before saving; moving the pin clears confirmation. A delayed location result cannot overwrite a manual edit or an already confirmed position. Browser tests use simulated location results; a physical device's GPS accuracy is not guaranteed.

```sh
npm run dev:stop
```

Stop shuts down this checkout's application processes and its MongoDB instance. It preserves `.local/mongo`. Process records include each PID, process start time, and full command; the launcher verifies those records before sending a signal and refuses to stop unrelated processes. It does not force-kill unresponsive services. Restart after editing backend code; Vite reloads frontend changes automatically.

Startup and shutdown refuse an existing `.local/*.lock` directory rather than automatically deleting it. If an interrupted command leaves a lock behind, inspect its `owner.json` and compare the saved PID, start time and command with `ps`. Remove only that lock directory after confirming its owner is gone and no startup/shutdown operation is running; then retry. Never remove a live operation's lock.

## Local runtime and data

All services bind to loopback: Vite on `127.0.0.1:4173`, Express on `127.0.0.1:4300`, and an isolated MongoDB replica set `rs0` on `127.0.0.1:27018`. Existing system MongoDB data and services are not used or stopped. An occupied port makes startup fail with an explanation.

Setup generates a private replica-set keyfile and random credentials. MongoDB authentication is enabled on its first launch; its localhost exception is used only to initialize the replica set and first administrator. The app and API tests receive separate users restricted to `flock_dev` and `flock_test`. Runtime files are mode `0600`, the keyfile `0400`, and the `.local` directory `0700`.

| Local file | Purpose |
| --- | --- |
| `.local/runtime.json` | App database URI, session secret, and prototype origin |
| `.local/runtime.test.json` | Separate test database credentials and secret |
| `.local/mongo-credentials.json` | Bootstrap administrator and generated credential backup |
| `.local/mongo/` | Persistent database files |
| `.local/{api,web,mongo,dev,seed}.log` | Service and seed logs |
| `.local/*process*.json` | Ownership records used for safe shutdown |

Keep `.local` private; it is ignored by Git. Do not delete its credentials while retaining its database files. Startup deliberately refuses to reset data if the credential backup is missing. The local launcher does not automate database backups; the separate cloud preview has its own scheduled private backups.

Local development uses **plaintext HTTP and MongoDB on loopback, without TLS**. The cloud preview adds HTTPS, a password gate and a separately verified gateway secret before permitting simulated sign-in. Production mode without that explicit preview configuration is refused. Demo account selection remains a test facility, not real-user authentication.

## Checks

```sh
npm run dev:setup  # Start only the authenticated local database
npm run typecheck
npm test           # Real replica-set API integration tests in flock_test
npm run build
npm run dev
npm run test:e2e    # Real browser workflow against the running local app
```

The Playwright configuration uses the installed Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` when available. Set `FLOCK_CHROME_EXECUTABLE=/absolute/path/to/chrome` for another installation. Elsewhere, install Playwright's Chromium explicitly with `npx playwright install chromium`. Browser tests do not download browsers automatically or start a fake API.

Browser tests cover named public feeding/comments, dated commitments by an ordinary member, care comments/resolution, immediate-resolution reporting, the combined log after logout/reload, EN/SV and horizontal overflow at 390px/1440px. Location checks cover success, denial, unavailable/timeout fallback, manual editing, late callbacks and confirmation invalidation. They create UUID-named records in the running `flock_dev` database and remove only those records and their dependent records afterward. They never drop the interactive database. Screenshots, failure traces, and browser artifacts are under `.local/playwright-results`.

`npm run dev:seed` idempotently ensures fictional fixtures; it does not erase or overwrite existing observations. The lower-level `npm run dev:api` and `npm run dev:web` commands are useful for foreground development after `dev:setup`, but those manually started processes are outside the background launcher's ownership. Stop them with their terminal's Ctrl-C.

## GitHub Actions

[CI](.github/workflows/ci.yml) runs for pull requests and is called by [Release preview](.github/workflows/release.yml) on main-branch pushes. It uses Node.js 24, authenticated MongoDB and Chromium to typecheck, run API/runtime tests, build the frontend and exercise seven browser workflows, including delayed-session handling. Browser screenshots and the preview bundle are retained for seven days; runtime credentials and database files are excluded.

The release workflow uses three Google OIDC identities to publish an immutable image, test it and sign its eligibility, then invoke the VM's constrained deployment helper through IAP. It deploys only the password-protected preview. The [CI/CD guide](docs/development/ci-cd.md) retains the earlier scaffold's evidence and the remaining public production requirements.

## Prototype boundaries

This is a prototype with local development and a protected cloud preview, not public production v1. Facebook OAuth, images, account export/erasure, complete moderation administration, the full production recovery/privacy requirements and verified emergency-directory contacts are deferred. The emergency directory therefore presents an empty state instead of invented rescue numbers. Demo accounts are seeded on the server and may be selected by local testers or people with the preview password. Records are visible to visitors within that access boundary; mutations require a demo session, CSRF protection and the applicable ownership/state checks. Demo login intentionally does not prove a real person's identity.

## Upgrading the earlier private-notes prototype

The [revised design](docs/development/community-care-revision.md) and its [independent review](docs/development/community-care-design-review.md) define a versioned migration. Stop every old app process before the first cutover, preserve a private database backup, then run:

```sh
npm run dev:stop
npm run dev:setup
FLOCK_ALLOW_COMMUNITY_CUTOVER=1 npm run dev:seed
npm run dev
```

The explicit cutover flag is for the first migration of an existing legacy database; new installations and already migrated databases use the normal startup command. The revised API requires its schema marker before accepting application requests. Do not run the old application against the migrated database or roll back its schema without a separate compatibility/recovery plan.

Old leased assignments become open once, without invented commitment dates. Already purged, pending-purge and expired legacy cases remain terminal. Obsolete bird coordinates are removed. Only known synthetic fixture records have their old text/attribution explicitly published; arbitrary text entered under the former private label stays withheld. New submissions use public fields. Repeated seeding preserves contributions and does not release new dated commitments. A republication interface for withheld legacy text is outside this prototype.

The future deployment must replace local account selection, enable transport security, implement the deferred operational and privacy workflows, and pass the production design's security checks. See [the milestone plan](docs/development/prototype-plan.md) for its verification scope and [design changes](docs/development/design-changes.md) for documented implementation findings.
