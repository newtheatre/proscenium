# 8. Test plan

Fifty-four named cases that must never regress, filed by the tier that runs them (CI and test harness, Foundations' Design tab). Integration cases run against a real D1 through the kit's harness; end-to-end cases run in Playwright on CI only, as the repository requires. Each story's failing tests land before its code.

## Core

| Case | Tier | Proves |
| --- | --- | --- |
| `collection-season-bound-refuses-other-season` | integration | CL1 on insert, as a statement predicate, with two requests racing a season change |
| `collection-production-season-change-refused` | integration | Moving a production out of a season-bound collection's season is refused with the remedy |
| `collection-page-hides-drafts` | integration | Only published members on `/collections/<slug>`; staff count includes drafts |
| `collection-archived-page` | e2e | Archived page wording; not found when past shows are private |
| `collections-for-binds-at-most-90` | unit | `collectionsFor` with 500 ids makes statements of at most 90 bound parameters |
| `drop-in-shape-fixed-after-draft` | integration | Changing `shape` on a scheduled performance is refused |
| `drop-in-no-doors-no-intervals` | integration | DI2 on create and edit |
| `drop-in-within-operating-day` | integration | 03:00 to 05:00 refused; 10:00 to 17:00 accepted; across the clock change |
| `drop-in-guarded-like-any` | integration | An exclusive space refuses a timed show inside a scheduled drop-in's hours |
| `drop-in-public-wording` | e2e | "Open 10:00 to 17:00" on the page, the email and the feed (transparent) |
| `line-up-time-inside-performance` | integration | LU1; moving the performance moves item times in the same unit |
| `line-up-production-once` | integration | LU2 refused on a second add |
| `line-up-unannounced-hidden` | integration | Not on public pages or the linked production's page |
| `per-performance-credit-belongs` | integration | LU4: a performance of another production is refused |
| `per-performance-credit-team-fact` | integration | LU6: the credited person holds `core.production-team` |
| `create-production-no-commit` | unit | `createProduction` adds statements and commits nothing on its own |
| `schedule-performances-reports-refused` | integration | Two drafts clashing with each other: first scheduled, second refused `space-taken`; a closure refused `closed`; nothing else changes |
| `import-all-draft` | integration | Nothing imported is scheduled or published |
| `import-repeat-updates` | integration | Second pretalx import of the same event updates by `external_ref` and leaves other edited fields alone |
| `import-chunk-repeat-safe` | integration | A chunk run twice makes nothing twice |
| `import-undo-refused-when-sold` | integration | Undo refused, naming the performance, once a ticket exists |
| `import-private-address-refused` | integration | IM5: a pretalx address on a private network is refused |
| `import-nonexistent-local-time` | unit | IM4: a time in the spring gap is refused by row |
| `video-link-visibility` | integration | VL2 for live and recording around the start and end |
| video-host-parse | unit | VL1: each host's address forms give the right id and player address; a lookalike host, a switched-off host and a non-https address are refused |
| video-no-request-before-play | end-to-end | VL4: loading the page makes no request to the host; pressing Play loads the frame; Remember skips the notice next time in that browser only |
| video-frame-policy | integration | VL3, VL5: the content-security frame list holds only switched-on hosts on pages with a player and none elsewhere; the frame carries its sandbox, referrer policy and title |
| video-player-a11y | end-to-end | The Play notice is reached and pressed by keyboard, has an accessible name, never autoplays; the Watch on link is present with and without the frame |
| calendar-feed-merge | integration | C-70: two contributors' events appear in one feed with UIDs ending in the site marker; a failing contributor leaves the other's events; a switched-off one adds nothing (CF3, CF6) |
| calendar-feed-token | integration | CF1, CF2: only the hash is stored; Reset kills the old address; an unknown token answers not found; the response is private and no-store |
| calendar-feed-foh-carryover | integration | CF5: a Front of house feed address made before the migration still answers, now with the merged feed |
| calendar-feed-public-safe | unit | CF4: the kit's check refuses a contribution whose title or location field is declared from a personal or free-text column |
| `person-busy-no-strangers` | integration | A contributor's answer names only the accounts asked about; a switched-off module answers nothing |
| `public-wording-two-contributors` | integration | First in manifest order applies and the health check warns |
| `production-section-not-applying-renders-nothing` | e2e | No section markup when `appliesTo` is false |

## Identity

| Case | Tier | Proves |
| --- | --- | --- |
| `microsoft-issuer-must-match-tid` | unit | MS2: a token whose issuer names another tenant than its `tid` is refused |
| `microsoft-tenant-allow-list` | integration | A tenant not listed is refused; personal accounts refused unless allowed |
| `microsoft-email-not-trusted` | integration | MS3: without `xms_edov`, an existing account with that address is not linked; the email code is asked for |
| `managed-domain-one-provider` | integration | MS4: a domain in two managed lists is refused by the settings rule; an address in a Microsoft-managed domain cannot sign in by link or Google |
| `oidc-discovery-https-only` | integration | MS5 refusals |

## Forms

| Case | Tier | Proves |
| --- | --- | --- |
| `answer-key-never-sent` | unit (build) | Every route that serialises a definition goes through `publicDefinition`; a definition with `answer` in any response body fails |
| `marking-on-server-only` | integration | A crafted request carrying a score is ignored; the stored score is the server's |
| `marking-exact-match` | unit | MK2 for each question type, including multiple choice with one extra option |
| `marking-hidden-question` | unit | MK3: a hidden question leaves `out_of` |
| `marking-pinned-version` | integration | `addResponse` with an older `versionId` marks against that version's key |
| `system-transition-first-match` | integration | AT2 ordering; stage history row with no actor; actions run once |
| `system-transition-chain-stops` | integration | AT3: the fifth move is recorded and the health check warns; a visible cycle refuses publish |

## Front of house and Box office

| Case | Tier | Proves |
| --- | --- | --- |
| `crew-questions-before-sign-up` | integration | CC1 refusal for a volunteer; a manager's assignment only warns |
| `handout-once` | integration | HO1 under two simultaneous requests: one row, one refusal naming who |
| `shadow-not-own` | integration | SH2: a lead cannot confirm their own shadowing |
| `shadow-places-not-counted` | integration | A shadowing assignment does not take one of the shift's places |
| `headcount-tap-once` | integration | The same device-made id sent twice stores one tap |
| `headcount-never-refuses-at-capacity` | integration | HC4: taps past capacity are stored and the figure says Full |
| `headcount-inside-not-negative` | unit | More out than in shows nought inside |
