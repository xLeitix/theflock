# Flock v1: UX and Vue/Bootstrap frontend design

> Historical proposal: the current [integrated design](../flock-design.md) and [community-care revision](../../development/community-care-revision.md) supersede anonymous attribution, private contribution notes, approved-helper roles and separate bird coordinates below. This snapshot is retained as earlier design evidence.

Status: specialist proposal for integration, based on the supplied brief and inspected mockup source; no application code or screenshots were produced.
Runtime constraint: Vue frontend and Express API on the Google Cloud VM; MongoDB is self-hosted on that same VM, never Atlas.
Integration decisions received from the lead: retain editable feeding time and one optional private care photo; public feedings are anonymous and feeding notes are private.

## 1. Evidence and intentional differences

The source references below refer to `/tmp/flock-design-mockup/NN-source.html`; the original `Pigeon Tracker.html` remains untouched.
The prototype uses fixed dimensions, inline CSS, SVG scenery, and `DCLogic` sample state; it is evidence for appearance and flows, not production Vue code or live data.

| Evidence | Observed design | Production interpretation |
| --- | --- | --- |
| 01:325–455; 19:325–405 | 390×844 map, floating search, recency chips, 520px details sheet | Preserve hierarchy and styling; make sizing fluid and content scrollable. |
| 02:324–382 | Add-place pin, 370px sheet, location accuracy, name, notes, feeding checkbox | Keep pin placement; permission denial must still allow manual placement. |
| 05:326–358, 409–525 | Desktop header, 16px gutters, 760px map/side panel, empty selection | Preserve adjacent map and details; remove fixed heights and hard-coded map coordinates. |
| 07–12; especially 10:324–358 | Facebook handoff, welcome, location explanation, cancellation | Real provider handoff, privacy-correct welcome, optional location, explicit cancelled state. |
| 13:334–410; 20:326–371 | Feeding sheet, time change, flock cards, food chips, notes | Shared mobile/desktop form with native radio/checkbox semantics and private-note label. |
| 14:324–414; 15:324–370 | Care issues, urgency, bird count, photo, timeline, helper action | Private photo and exact detail, structured authorized updates; no messaging or alerts. |
| 16–18; 18:334–375 | Emergency directory and Auto/English/Svenska language picker | Verified directory content; shared locale setting across every route. |

Remove artboards 03/04/06 and every Messages tab, unread count, message button, messaging preference, and messaging-related onboarding sentence.
Replace “Send report · alert nearby feeders” with “Submit report”; confirmation says the report is saved and that Flock does not contact rescue services.
Resolve conflicting prototype defaults: feeding checkbox initially unchecked; desktop feeding opens the same form as mobile; no preselected flock/food answer.
Resolve the English “50+” versus Swedish “fler än 50” overlap as Small <15, Medium 15–50 inclusive, Large >50 everywhere.
Resolve the prototype's “never fed”/red marker for a new place as “No feeding recorded” with neutral styling; missing evidence does not establish hunger.

## 2. Visual tokens and Bootstrap boundary

Implement tokens in one SCSS/CSS layer and map relevant values into Bootstrap variables; feature components consume semantic tokens rather than repeating hex literals.

| Token | Source value | Use |
| --- | --- | --- |
| `brand`, `brand-hover`, `brand-subtle` | `#4636A3`, `#2E2273`, `#ECEAF8` | Feeding/add-place actions, selected controls, navigation. |
| `care`, `care-ink`, `care-subtle`, `care-border` | `#A3175F`, `#6E0F40`, `#FBE8F1`, `#F0C3DA` | Welfare actions and case summaries; preserve distinction from feeding. |
| `text`, `text-secondary`, `text-muted` | `#161B26`, `#3E4656`, `#586174` | Body, supporting content, metadata. |
| `surface`, `surface-muted`, `page-desktop` | `#FFFFFF`, `#F6F7F9`, `#EDEFF2` | Sheets/cards, inset panels, desktop canvas. |
| `border`, `input-border`, `divider` | `#D6DAE1`, `#C3C8D1`, `#EEF0F3` | Card edges, fields, list separators. |
| `fed`, `due`, `overdue` | `#1E7F45`, `#F4C542`, `#C83A2B` | Recency markers; yellow uses dark text, other markers white. |
| `fed-subtle`, `due-subtle`, `overdue-subtle` | `#E6F3EB`, `#FDF5DC`, `#FBEAE7` | Status blocks with explicit text. |
| `location`, `location-subtle` | `#2563EB`, `#EAF0FD` | Own-location dot, accuracy halo, location information. |
| `unknown` | Proposed `#586174`, white label | New/no-history marker, distinct from stale feeding data. |
| Map illustration palette | `#E9ECE6`, `#CFE2C4`, `#BCD3E8`, `#F7F8F5` | Visual target for a quiet base map, subject to provider styling support. |

Use Inter for body/UI with system fallback; Space Grotesk 700 for brand and headings, typically `letter-spacing:-0.02em`; self-host licensed font files after license verification.
Body/controls use 16px; supporting text 14–15px; metadata 13px; map labels may be 11–12px only with equivalent readable detail/list text.
Headings: place 24px mobile/26px desktop, form 26px, welcome 30px, desktop directory 36px; allow wrapping rather than shrink-to-fit.
Retain 10px field radii, 12px action/card radii, 14px selection-card radii, 16px desktop-panel radii, 22px sheet top corners, and pill search/chips.
Retain 48px field/search height, 52px principal actions, 44px icon controls/markers, 56px add-place FAB; use minimum heights so translated labels can wrap.
Spacing follows 4/8/12/16/20/24/32px; mobile form horizontal padding 20px, onboarding 24px; desktop workspace gap/padding 16px.
Floating control shadow: `0 1px 4px rgba(22,27,38,.2)`; sheet shadow: `0 -4px 20px rgba(22,27,38,.15)`; modal scrim `.45` dark ink.
Selected place keeps the prototype's white 4px + dark 7px outer rings; keyboard focus gets a separate visible outline, not only the selected treatment.
Use Bootstrap grid, spacing, forms, buttons and utility primitives, customized to these tokens; do not let Bootstrap's default blue/rounded cards replace the supplied identity.
Vue owns interactive state and DOM; do not attach Bootstrap imperative modal/offcanvas plugins to the same elements that Vue controls.

## 3. Responsive shell and interaction layout

Mobile map (`<992px` initial breakpoint proposal): viewport-filling map with `100dvh`, safe-area insets, 12px floating-toolbar offsets, and three bottom destinations: Map, Emergency, Profile/Log in.
Search, locale and session controls preserve the reference arrangement at 390px; at 320px the toolbar wraps to two rows rather than compressing the search into an unusable field.
Recency chips remain horizontally scrollable on narrow screens, with visible overflow cue; the same options are available through an accessible labelled filter control.
Place selection opens a nonmodal details sheet with compact, expanded and closed states; 520px is a reference target at 844px height, never a fixed requirement.
Expanded sheet has a scrollable body and a labelled expand/collapse button; drag is optional enhancement, never the sole way to resize or dismiss.
The map remains operable outside the nonmodal sheet; clicking another pin updates the selection without losing the viewport. Main navigation remains reachable when expanded.
At narrow/short landscape viewports, place detail and forms can use a full-height route view; avoid trapping the user between two tiny scroll regions.
Desktop (`>=992px`): white header with brand, search, Map/Emergency links, locale and session; workspace grid `minmax(0,1fr) minmax(320px,400px)` with 16px gap.
Map and side panel fill available height below the header; the panel scrolls independently, with actions visible or reachable and no page-level horizontal overflow.
Feeding/login/language dialogs become centered panels on desktop; add-place stays beside the map; report and case routes use a constrained reading/form width.
All dialogs use viewport-constrained maximum height and scrollable content; keyboard appearance must leave the focused field, validation and submit action reachable.
Use `ResizeObserver` to notify the map renderer after shell/sheet changes; fit selected coordinates into unobscured map bounds, accounting for panels and safe areas.
Do not reproduce the prototype's absolute `bottom:536px` FAB position; anchor controls to measured map-safe space and collapse redundant controls when space is tight.
Use one feature component tree across breakpoints, with CSS layout changes and explicit presentation mode; avoid duplicate mounted forms, IDs, caches or submissions.

## 4. Routes, components and ownership

| Route | Access | Presentation and state |
| --- | --- | --- |
| `/map` | Public | Viewport, filters, list/map toggle, selected public place ID. |
| `/places/:id` | Public | Deep-linkable details, mobile sheet/desktop panel when opened from map; standalone fallback on direct entry. |
| `/places/new` | Member | Placement step then form; protected login intent preserves only safe route context. |
| `/places/:id/feedings/new` | Member | Modal route over map/details or complete page after direct load. |
| `/care-reports/new?place=:id` | Member | Issues, urgency, location, private description, optional private photo. |
| `/care-reports/:id` | Public redacted; private detail by ACL | Coarse summary for visitors; sensitive detail and actions only with returned capabilities. |
| `/emergency` | Public | Region selector, directory, verification dates; usable without login or geolocation. |
| `/login`, `/welcome` | Public/authenticated setup | Login explanation, returning intent, profile setup; actual OAuth endpoints belong to server. |
| `/profile` | Member | Own alias, language, contribution history, privacy explanation, sign out and deletion request. |
| `/privacy`, `/terms`, `/data-deletion` | Public | Real maintained content linked from authentication and account settings. |
| `/moderation` | Moderator | Restricted review of flagged content, helper approvals and case resolution, according to server permissions. |

Use Vue 3 SFCs + TypeScript, Vue Router, Pinia for session/preferences, and a typed API/query layer; exact compatible package versions are an implementation dependency, not verified here.
Feature folders: `map`, `places`, `feedings`, `care`, `auth`, `emergency`, `profile`, `moderation`; shared `ui`, `i18n`, `api`, `map-adapter`, `validation` modules.
Shared UI: `AppShell`, `MainNav`, `ResponsiveDialog`, `DetailSheet`, `FieldError`, `InlineNotice`, `EmptyState`, `AsyncButton`, `PrivacySummary`, `StatusBadge`.
Map/places: `MapCanvas`, `PlaceMarker`, `PlaceCluster`, `RecencyLegend`, `PlaceSearch`, `PlaceList`, `PlaceDetail`, `FeedingHistory`, `LocationPicker`.
Forms/care: `FlockSizePicker`, `FoodPicker`, `FeedingForm`, `PlaceForm`, `CareReportForm`, `PrivatePhotoPicker`, `CaseSummary`, `CaseTimeline`, `CaseActions`.
Keep route data in the API/query cache, draft fields local to form composables, and ephemeral UI state in the owning page; Pinia does not become a second database cache.
Session store distinguishes `unknown`, `anonymous`, `member`, `restricted`, and `expired`; initial unknown state must not briefly expose authenticated/private controls.
Map UI state distinguishes `browsing`, `placeSelected`, `placingNew`, `searching`; draft forms track `pristine`, `editing`, `validating`, `submitting`, `saved`, `failed`, `outcomeUnknown`.
Place IDs and nonsensitive filter state may enter URLs; do not put own GPS fixes, care exact coordinates, names, notes, OAuth credentials or private photo URLs into navigation queries.
Route guards improve UX but are not authorization; capability flags from each response determine action visibility, while every API mutation remains server-authorized.

## 5. Public map, search and place details

Initial map uses a configured launch area or last nonsensitive viewport; do not request location permission on load. The launch area is still a project decision.
Search first covers Flock place names; do not retain “or streets” unless a researched geocoding service is explicitly included. Debounce requests and cancel superseded results.
Geographic loading uses `GET /api/v1/places?bbox=west,south,east,north&zoom=N`; renderer works from bounded server summaries and clusters rather than downloading all records.
Counts identify their scope as “In this map area”; server totals include unknown separately and care as an overlapping count, never as a fifth mutually exclusive feeding category.
Use canonical server recency: <=48h green, >48–96h yellow, >96h red, no feeding unknown. Show “No recent feeding recorded” rather than asserting the birds' physical condition.
Each pin has visible recency/unknown text, care badge when permitted, and accessible name containing place, latest recorded feeding, and care-summary presence.
Cluster button announces count and activates zoom/expansion; dense or coincident pins have list access. Pagination and clustering must never silently imply the loaded sample is every place.
Details show public place name, selected pin location, latest feeding time, latest reported flock size with its observation time, and anonymized recent records.
Use “Latest reported flock” rather than the mockup's unsubstantiated “Usual flock”; missing size stays “Not recorded,” never the prototype's fallback Medium.
Public rows say “Community feeding”; no Facebook/display names, initials, profile links or stable public author identifier. An authenticated owner can see “Your feeding” in their own authorized view.
Feeding notes appear only to author/moderator; public DTOs must omit them entirely. Empty history says “No feedings recorded here yet,” with a login-aware record action.
Distance is calculated locally only when location is available, labelled approximate straight-line distance; otherwise omit it. Never retain fake “180 m” or “±12 m” values.
Directions opens the selected external provider only on explicit click and supplies the public destination, not an automatically attached user-origin coordinate.
Filtered-empty, no-places-in-area, no-search-match, loading, stale data and provider failure are distinct messages with clear reset/retry/list actions.

## 6. Location and adding places

Location state is `unrequested`, `requesting`, `available`, `denied`, `timeout`, `unavailable`; permission explanation precedes a user-triggered one-shot browser request.
Explain: “Your location helps position the map. A place pin you save is public.” Never promise that a submitted location remains private when it becomes a public place.
Keep raw GPS fix/accuracy only in memory; no background tracking, continuous watcher, analytics coordinate event, or GPS-bearing draft persistence in v1.
Manual placement always works by map center/crosshair, keyboard pan or typed coordinates with validation; use existing place search when GPS is unavailable.
Show actual uncertainty and offer repositioning; if manually moved, change wording to “Position selected on map” rather than continuing to claim GPS accuracy.
Add-place flow: choose pin → show nearby existing places to prevent duplicates → name and optional private note → unchecked “I fed them here just now” → privacy review → save.
Checking the feeding option reveals the same required flock/optional food controls as `FeedingForm`; one atomic request saves place plus initial feeding, with one idempotency key.
Before save display: “This place pin and anonymous feeding records are public. Your account identity and private notes are not.” Place names must not contain personal contact details.
Coordinate validity, field length and supported-area rules come from shared API schemas; show duplicate candidates with “Use existing place” rather than silently merging or inventing a new name.
Save success selects the returned place and server-confirmed record; failure retains the draft in memory, including chosen pin, without inventing a marker or success toast.

## 7. Feeding form and mutation semantics

Header identifies the place and feeding time; the mockup's “Change” opens a labelled date/time control with an explicit timezone. Defaults to now and requires a flock choice.
`occurredAt` may be up to seven days earlier and at most five minutes ahead of server time; `createdAt` is server-generated and distinct. Server normalizes small future skew for recency.
Use native radio inputs styled as the three reference flock cards; food types are optional multi-select checkboxes with stable codes, not translated values as storage keys.
Food labels must be semantically equivalent across languages: prototype Seeds/Solrosfrön and Grain mix/Fröblandning are not interchangeable translations; agree the taxonomy before release.
Label notes “Private note (only you and moderators can read this)”; no private-feeding toggle because place, time/recency and flock observation are public by design.
Confirm publication in the form before submit, including the selected public location; a care-report link preserves the unsaved feeding in memory and does not save it implicitly.
Submitting disables duplicate activation and exposes status text; send `Idempotency-Key`, preserve that key for an identical retry, and create a new key only for a new logical submission.
On confirmed success update/refetch place summaries and history, close form and announce “Feeding recorded”; do not turn the marker green optimistically before server acknowledgement.
An uncertain network outcome says “We could not confirm whether this was saved”; reconcile/retry the same operation rather than inviting a second independent record.
Validation focuses an error summary then links to fields; 401 invites reauthentication without automatic resubmission; 403 explains account restrictions; 429 respects retry time.
Conflicts/removed places offer return to map or reopen current place; a submission form never treats a backend error as an empty successful response.

## 8. Care report, privacy and case lifecycle

Keep reference issue chips (wing injury, limping, string on feet, sick/fluffed up, cannot fly, young bird alone, other), urgency choices, bird count and descriptive field.
Issue chips use multi-select checkboxes; urgency uses radios with no urgency preselected, and “Urgent now” elevates the verified emergency action before form submission.
Separate public structured summary from exact location, private narrative and optional private photo. Public views cannot infer hidden detail from descriptions, filenames, DOM or cached responses.
Reporter, moderator, and current assigned approved helper alone can obtain sensitive case detail; ordinary login and self-offered help do not grant access.
Show a before-submit audience summary: public nearby place/coarse area, issue categories, urgency and status; precise position, description and photo restricted to the authorized care participants.
“I'm staying with the bird” is optional and unchecked; if retained, expose it only to authorized participants as a timestamped report, never as a live public presence indicator.
Allow one optional photo with preview/remove, clear private audience and processing progress. Limits: 10MB input, 20MP decoded, server-normalized longest dimension <=1600px.
Client checks are convenience only; server validates/normalizes and removes metadata. Serve approved media through authenticated API; do not embed public bucket URLs or third-party image transforms.
Explain supported formats from backend configuration, handle camera/file cancellation, invalid format, oversize, decode rejection and upload expiry; revoke local object URLs on removal/unmount.
A failed photo is never represented as saved. Let the user retry or explicitly submit without it; report creation and media association must have a defined recoverable contract.
Case page keeps status/urgency pills, descriptive heading, two-column facts and timeline. Unauthorized visitors see a useful redacted summary plus the access explanation, never a fake photo placeholder.
Replace “Message Maja” with permitted structured update actions; helper offer/assignment, observed-again and resolved events use dedicated validated controls, not a free-form chat stream.
Approved helper can claim only through the server's atomic assignment flow; disabled/conflict states explain when another helper is already assigned. Unapproved members see how approval works.
Resolve/reopen/withdraw controls follow returned capabilities; confirmed status changes refresh timeline. Concurrent changes use `If-Match` and require a fresh read before retry.
Poll active case detail while visible (proposed 30 seconds) with backoff/jitter, stop on background/unmount, and show “Updated …”; no push subscriptions or messaging sockets.
Share action copies only the public redacted route; returning through that link must not grant sensitive access. Clear sensitive data/media on logout, account switch or permission loss.

## 9. Authentication, onboarding and account states

Anonymous users can browse map, redacted care cases, emergency directory and policy pages; contribution actions explain the needed login and preserve the intended place/action.
Facebook button navigates to the server OAuth start endpoint. Artboard 09 is a provider-owned handoff reference; never recreate a Facebook password/consent form inside Flock.
Return intent is a validated internal route/token, not an arbitrary redirect URL; preserve locale and safe draft context in tab/session storage only where it contains no sensitive fields.
Welcome explains anonymous public records and private account identity; editable alias is for the user's account/authorized workflows. Omit Facebook-photo import and messaging switches in v1.
Successful login resumes the draft for review; it does not automatically record feeding, create a place, or submit a care report. Location permission is independent and skippable.
Cancelled login restores browsing and shows “Login cancelled. Nothing was submitted.” Provider rejection, expired handoff, connectivity failure and unavailable login get distinct retry/browse states.
If login returns after a full redirect, sensitive in-memory draft may have been lost; explain that clearly and restore only safe route context. Never silently persist a private photo/narrative to local storage.
Account UI includes sign out, session expiry notice, own submissions, helper approval status, language, privacy information and account-deletion request status; no public profile directory.
Logout clears private query data, photo URLs and drafts across views; another tab's session change triggers session refresh and clears restricted content before allowing more actions.
Deletion UI explains the actual server retention/anonymization policy and presents confirmation; it must not promise that already-public location/feeding data is necessarily removed.

## 10. EN/SV content, emergency directory and accessibility

Locale values are `auto`, `en`, `sv`; use browser preference for Auto with English fallback, persist explicit preference locally, and sync member preference when available.
Use message catalogues with plural/date/relative-time formatting and stable codes; never concatenate translated fragments or use visible English labels as business identifiers.
Set document language and translated page title on navigation; use `Intl` for dates/numbers, with a visible timezone for editing and an exact timestamp behind relative labels.
Language switching keeps the current route, viewport, form values and focus; place names and user-entered content remain as written. Remove “messages” from the language explanation.
Validate every route, error and auth/privacy message in both languages; include long Swedish labels, å/ä/ö search, and mixed-language notes in fixtures.
Emergency page is public and readable without the map; use reference red human-danger banner and white contact cards, phone `tel:` links, desktop copy action and visible copy feedback.
Directory records need supported region, verified number, operating hours/timezone, service scope, source and checked date; no `[PHONE]`/`[DATE]` placeholders can reach production.
If local details are unavailable, say so and retain only independently verified general entries; do not imply an organization is open or accepts pigeons unless supported by its record.
The reference animal-handling advice and emergency numbers require authoritative verification before release; retain direct call priority and no promise of rescue dispatch from a saved report.
Target WCAG 2.2 AA; test contrast of actual combinations, 200% text scaling and 400% zoom, 320 CSS-pixel reflow, reduced motion, and keyboard-only operation.
Every map action has list/search/form equivalents; map pan/drag is never the exclusive means of finding a place or setting a location. Provide skip-to-main/list controls.
Modal dialogs trap focus, mark background inert, close with Escape/visible control where safe, and restore focus. Nonmodal place sheets do not claim `aria-modal` or trap focus.
Use labelled native fields, fieldsets/legends, meaningful button names, radio arrow-key behavior, `aria-invalid`/`aria-describedby`, and visible focus on every interactive element.
Announcements are concise: loading/saved/cancelled/status updates via polite regions, blocking errors via alert; do not announce every map pan, polling tick or pin rerender.
Minimum touch target 44×44px, including enlarged hit regions around visual 32px chips; status never relies solely on color. Respect reduced motion for map fly-to/sheet animations.

## 11. Map adapter, loading and operational behavior

Define renderer-neutral `MapAdapter`: `mount`, `setViewport`, `fitBounds`, `setPlaces`, `setClusters`, `setSelectedPlace`, `setOwnLocation`, `setDraftPin`, `resize`, `destroy`.
Expose typed `viewportChanged`, `placeActivated`, `clusterActivated`, `draftPositionChanged`, `ready`, `error` events; coordinates use one explicit GeoJSON-compatible longitude/latitude convention.
Provider-specific tokens, attribution, tile styles and renderer objects stay inside adapter/configuration; components consume domain summaries, not map-library classes.
Initial renderer candidate: Leaflet-style raster integration for modest marker counts; MapLibre-style vector rendering is an alternative if branded basemaps/scale justify it. Lead research decides.
Tile service, geocoder, directions target, attribution, key restrictions, costs and allowed caching remain verification dependencies; do not assume unlimited free community tiles.
Lazy-load the map/renderer and private routes; eager-load shell/critical CSS. Display list/data shell while renderer loads; map failure must leave public details and emergency navigation functional.
API/query keys include permission scope; private responses never enter a public cache. Cancel requests on changed viewport/search and reject stale out-of-order results.
Frontend shows map-data and tile failures separately; network offline notice allows already-displayed content with stale timestamp but blocks mutation without creating a hidden offline queue.
No service worker or persistent private-data cache is required in v1; versioned static assets may be browser-cached. A frontend boundary catches fatal route errors with reload/support reference.

## 12. Acceptance gates and remaining integration dependencies

Visual QA compares actual implementation at 390×844 and 1440×900 against supplied artboards; additionally test 320px width, short landscape, tablet, long translations and virtual keyboard.
Functional E2E gates: anonymous browse → login cancel; login success → review/save exactly once; denied GPS → manual pin; add place + initial feeding; backdated feeding; private photo report.
Privacy E2E gates inspect API responses and browser storage: anonymous histories contain no identity/notes; unauthorized case loads contain no precise position/narrative/media; logout revokes visible private content.
Accessibility gates combine automated checks with keyboard and screen-reader map/list, sheet, radio, error-summary and locale tests; visual snapshots alone cannot establish conformance.
Failure fixtures cover empty data, unavailable tiles, expired session, throttling, pending media, unknown mutation outcome, duplicate place, removed place, concurrent helper assignment and permission loss.
Contract tests exercise recency boundaries, unknown history, flock boundaries at 14/15/50/51 birds, locale equivalence, idempotent retry and stale query rejection using shared API schemas and controlled clocks.
Open integration items: launch geography; map/tile/geocoder choice; exact public care-location coarsening; moderator/helper approval process; care-photo association lifecycle; retained/deleted account-data policy.
Content approvals still needed: Swedish review, food taxonomy equivalence, verified local emergency directory/handling advice, policy pages, and source/font/icon licenses.
This proposal has not verified provider approvals, current library versions, Facebook permissions, cloud resources, costs, browser rendering or live accessibility; those are implementation/release gates, not assumed results.
