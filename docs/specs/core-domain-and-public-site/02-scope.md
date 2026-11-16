# 1. Scope

This workstream specifies the records every other module hangs its work on, the core services they all call (programme, vocabularies, files, notifications, and brand and organisation), and the public site that shows the programme to the world. It is designed from scratch. Proscenium, Mailflare and Flytower are cited only as evidence for a lesson.

## In scope

| Area | What is specified | Lives in |
| --- | --- | --- |
| Programme | Seasons, productions, credits, advisories, performances | Core |
| Places | Venues, spaces, closures and public holidays | Core |
| Files | Upload, cleaning, storage, access rules, image sizes, deletion | Core |
| Notifications | Types, templates, preferences, email, inbox, digests, retries, the send log, sender identities | Core |
| Branding | Name, colour, fonts, logos, contact details, and how they reach every surface | Core |
| Organisation settings | Contact details, legal name, social links and the day the theatre's year ends. The name, time zone, language, currency and day start are foundations settings, which core's calendar helper reads | Core |
| Content structure | The layout of the fork's `site/` folder, collections, front matter, tokens, placeholders, redirects | Public site module |
| Public components | What's on, production page, season grid, booking button, archive, venue pages, news | Public site module |

The split between the two matters. Core is always on. The public site is a module, so a theatre that only wants the staff tools, or that keeps an existing website, can switch it off and lose nothing else. While it is off, its addresses stay reserved and answer "not found".

## Out of scope

| Not here | Where it belongs |
| --- | --- |
| Accounts, people, sign-in, roles, consent records, erasure orchestration | Workstream 2 |
| Tickets, prices, sale state, seating plans, holds, capacity enforcement, customers | Workstream 4 |
| Custom fields on productions and venues, and theatre-defined forms | Workstream 5 |
| The three shells, navigation chrome, list and page conventions, final wireframes | Workstream 6 |
| The manifest, registry and event-bus formats, repository layout, CI | Workstream 1 |
| Room booking and its policy engine (it uses the spaces defined here) | Spaces, later round |
| Mailing lists, marketing consent, campaigns (they use the email channel defined here) | Communications, later round |
| The committee list, document register, elections | Governance, later round |
| Auditions, rehearsals, tasks, budgets, rights tracking | Production management, last |
| An in-app editor for content pages | Decided: Git only, Nuxt Studio documented |

## Assumptions about other workstreams

Each of these is something this specification relies on and does not define. The last column records where each stood on 16 November 2026, after the foundations draft and the integrating thread's rulings.

| # | Assumption | Owner | Status |
| --- | --- | --- | --- |
| A1 | A module declares settings, abilities, record types, events, jobs, tasks and points in one manifest | 1 | Confirmed by foundations draft 1. This document uses its names throughout. |
| A2 | Core tables are prefixed `core_`. The public site module's id is `public-site` and its tables would be `public_site_` | 1 | Confirmed. The public site owns no tables in the first release. |
| A3 | An event is written in the same batch as the change that caused it and delivered at least once | 1 | Confirmed |
| A4 | A **point** lets a module contribute to a named place another module offers, without either importing the other | 1 | Confirmed. The booking button, change impact and public components all use points (part 4). |
| A5 | One calendar helper owns time-zone and operating-day arithmetic | 3 | Accepted as this workstream's (part 4) |
| A6 | Every person a module records, including one who books as a guest, is an account in `core_accounts` (an unclaimed one for a guest), reachable at the address `addressFor` gives for a side. A bare address is used only before an account exists, such as a sign-in link sent to an unknown address | 2 | Confirmed by workstream 2: addressFor(accountId, side) returns the verified address for a side, with members falling back to audience. |
| A7 | Merging two accounts moves core's rows through the column declarations, and erasure is one batch built from the data-class registry | 1 and 2 | Confirmed by the foundations format |
| A8 | Audience and member sides have separate inboxes and preference pages; this workstream supplies the notification part of each | 2 and 6 | Consistent with workstream 6's shells, which own the account area's frame through `core.account-section`. Every send names its side through its notification type. The side values are `audience` and `members`, workstream 2's names, throughout this document. |
| A9 | Box office enforces capacity as a database constraint and reads the house capacity from `capacityOf()` | 4 | Confirmed by workstream 4. It reads the capacity of a space and of a performance from core's services (part 4) and enforces the limit itself |
| A10 | Custom fields attach to a record type by its registered name (`core.production`, `core.venue`) | 5 | Consistent with the foundations record-type registry |
| A11 | Reusable option lists (vocabularies) have one home | 3 | Ruled: core owns them. Part 2, group 3. |
| A12 | A service exists that answers "everyone holding this ability on this record", for `notifyHolders` | 2 | Confirmed by workstream 2: holdersOf(ability, record). |
| A13 | The theatre's folder is the Nuxt project itself, so its paths are `site/app/pages`, `site/app/components`, `site/server` and `site/content` | 1 | Found by the foundations proof, and used throughout this document. |

## Choices made here that others should know

- **A performance does not know whether it is on sale.** Core holds draft, scheduled, cancelled and completed. Sale state is Box office's. Matt decided this on question 1, and the paper's Part A now says the same.
- **An external booking link is a core field**, so a theatre with no Box office module still gets a working booking button.
- **Addresses that never break.** A production lives at `/whats-on/<slug>` while it is current and at /shows/\<slug> once it is past. Each address redirects to the other as needed, so a link never breaks (Matt's decision, question 7).
- **The suppression list for bounced addresses is core's**, because receipts must respect it too. Communications reads it.

## Sources

Every claim about another system in this document is listed with its file or page in the Sources tab.
