# Lessons from Proscenium

Proscenium proved the operational core of a theatre can run as one application on Cloudflare, and it also showed where a single-theatre build goes wrong for everyone else. These lessons come from its backlog (328 stories in 11 modules), its 120 decision records and its known-issues register, read on 16 November 2026.

## Worth keeping as ideas

- **One account, one calendar, one ledger.** Replacing four apps with one removed whole classes of reconciliation work.
- **Money as integer minor units in an append-only ledger**, with corrections that supersede and never edit.
- **Authority derived from facts.** Tonight's confirmed shift or a current training record grants access, and standing roles expire.
- **Policy as configuration**, enforced where data is written and quoted live on public pages through tokens.
- **Everything record-like keys to a performance**, not to a date or a room.
- **Erasure as anonymisation**, so history survives a data-protection request.
- **Capacity as a database constraint**, so two people cannot buy the last seat.
- **Navigation shaped by posture.** A member sees a calm shell; an officer sees a console; tonight's staff see tonight.
- **A phone-first show night** with a local cache and a write queue for a venue with poor signal.
- **A known-issues register** that records what was knowingly left unsolved.

## Done poorly, to design out

| Weak spot in Proscenium | What the new platform does instead |
| --- | --- |
| NNT's rules are invariants: one card reader, one sign-in domain, a 31 July year end, London time, a 04:00 show night | Each is a setting or a pluggable provider with NNT's value as one choice |
| Productions were deferred entirely (8 stories, none in the first release), so the thing a theatre exists to do lives in other tools | Productions and performances are core records from day one; managing a production's process is a later, optional module |
| Finance (13 stories) and communications (15) are thin beside ticketing (51) and training (44) | Budgets, expenses and mailing lists are first-class modules |
| Public pages are markdown with no editing surface | Content pages in the fork, with an optional visual editor |
| Some features exist only as API routes with no screen (bar discounts, choice groups) | A module is not done until its screens exist |
| Policy numbers still leak into code as constants | Settings are declared in one registry and a check fails the build on a stray constant |
| Personal data is classified per table, not per column | Every column declares its data class and its erasure behaviour |
| Tests run only on CI, fail on Windows, and none exercise the real D1 driver | Tests run locally on Linux against the real runtime |
| 120 decision records in under three months, many about one screen, plus a 210 KB architecture file | Few, durable decisions; screen-level rules live beside the screen |
| Per-record permissions arrived late, as a note that the first release must not preclude them | The permission model scopes to a single record from the start |
| No rate limiting beyond reservations | Rate limiting is a platform service every route declares |
| A hard cutover from four legacy apps shaped the schema and the timeline | Import is a separate, optional tool that never shapes the core schema |
| Role names are NNT committee posts, with decisions about which post holds the bar or safety | Roles are data a theatre defines; the platform ships presets |
| Free-text fields about third parties escape classification | Free text is a declared data class with its own retention |
| The inbox never marks anything read; message templates are not versioned | Notifications are a complete service before any module uses them |

One more, raised by Matt as a known pain point at NNT: **there is no clear separation between audience and member accounts.** Audiences do not care what members have available, and members do not want to manage two accounts. The Accounts sub-tab under Part A answers it.

## Not covered at all

Proscenium has no answer for these, and a general platform needs one:

- Online card payment
- More than one venue or organisation
- Touring and visiting companies, and venue hire
- Allocated seating plans
- Fundraising and donations
- Auditions and casting
- Script and performing-rights tracking
- Props, costume and set inventory
- Volunteer hours and recognition
- Languages other than English and currencies other than sterling
- Access bookings beyond a companion ticket
- Wallet tickets and a list of a member's past bookings
