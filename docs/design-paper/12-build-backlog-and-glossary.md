# Build backlog and shared glossary

As of 16 November 2026, after all of your answers. This tab is the index that joins the twelve specifications into one order of work. The table below was brought up to date after the consistency review of 16 November 2026 and is the current count; the phase tables further down cover the first round's phases 1 to 3, with the second round's changes listed after them. The stories themselves stay in each specification's "7. Stories" tab, so there is one copy of each. Dependencies were reported by each workstream and have not yet been checked story by story against the other documents; the cross-references by story id are the next piece of integration work.

## The backlog in numbers

| Workstream | Ids | Stories | Gate | Rest of first release | Later | Where |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Foundations | F-01 to F-37 | 37 | 11 | 24 | 2 | [Foundations](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x), tab 7 |
| 2. Identity | ID-01 to ID-45 | 45 | 9 | 29 | 7 | [Identity](https://claude.ai/artifact/BcVS8iNe7oDZCPmW4gyus5), tab 7 |
| 3. Core domain | C-01 to C-52 | 52 | 0 | 44 | 8 | [Core domain](https://claude.ai/artifact/Qt8cFSyEekr7tfpiMCqe2E), tab 7 |
| 4. Box office, payments, finance | BO, PAY, FIN, R | 69 | 17 | 46 | 3, plus 3 for allocated seating | [Box office](https://claude.ai/artifact/MUbXSQbs4vQKMyvxZL44Po), tab 7 |
| 5. Form builder | FB-101 to FB-512 | 43 | 0 | 31 | 12 | [Form builder](https://claude.ai/artifact/6E5k2VS2PnhdciVNMeap5s), tab 7 |
| 6. Interface | UI-01 to UI-36 | 36 | 0 | 25 | 11 | [Interface](https://claude.ai/artifact/KwZ3oXcFJSMNj98kNc9ywW), tab 7 |
| 7. Front of house | FH-01 to FH-46 | 46 | 4 | 31 | 11 | [Front of house](https://claude.ai/artifact/6F8QhPq1EFKUabiJTB1dxA) |
| 8. Spaces | SP-01 to SP-48 | 48 | 4 | 32 | 12 | [Spaces](https://claude.ai/artifact/XEW9gcTLL4gMfgWeXaFrks) |
| 9. Bar | BAR | 48 | 8 | 31 | 9 | [Bar](https://claude.ai/artifact/QBYi2Dci21MVDj2CTuqvQK) |
| 10. Training | TR | 34 | 0 | 24 | 10 | [Training](https://claude.ai/artifact/Sit2qCdVGgB6BvGhDdREga) |
| 11. Membership | MEM-01 to MEM-58 | 58 | 9 | 40 | 9 | [Membership](https://claude.ai/artifact/2drDXf3PoCgPgXJXREBF5T) |
| 12. Communications | COM-01 to COM-38 | 38 | 6 | 15 | 17 | [Communications](https://claude.ai/artifact/377kofYbMZFHNDxMCaddYQ) |
| **All** |  | **554** | **68** | **372** | **114** |  |

A gate story is one that must be finished and proved before the work that rests on it starts. The form builder's first release belongs to roadmap phase 4, so phases 1 to 3 hold 195 stories from the first round, 37 gate and 158 others.

## Order of work

### Step 0: the kit (gate for everything)

F-01 to F-10 (the repository and the kit) and F-34 (tests run locally on Linux). Nothing else starts until these pass, because every other story is written against the kit. The form builder's engine, FB-101 to FB-106, needs only this step and can be built alongside anything later if there is spare capacity.

### Phase 1: a theatre can be set up and people can sign in

| Order | Stories | What it gives | Rests on |
| --- | --- | --- | --- |
| 1 | UI-11, 13, 14, 18, 19, 24, then UI-08 | The standard components and page types every screen is built from | Step 0 |
| 2 | ID-01, 02, 07, 10, 22, 23, 28, 29, 37 (Identity's gate) | Sign-in, the route guard, roles, grants and the first Owner | Step 0, and C-27, C-28 and C-32 pulled forward from Core domain to send one email (see finding 1) |
| 3 | UI-01, 02, 04, 07, 17 | The three shells, drawn from who is looking | Identity's gate, and C-35, C-36, C-37 and C-40 pulled forward from Core domain, with the part of C-23 that uploads one file (see finding 2) |
| 4 | F-11 to F-15 | Setup and one-step deploy | Identity's gate, the console shell |
| 5 | F-16 to F-24 | Modules, settings and credentials in the console | The console shell |
| 6 | F-26 to F-28, F-30 to F-33, F-35 | Merging a release, the owned-path check, applying migrations, health, jobs and audit, and linking a copy made by the deploy button to upstream | The console shell |
| 7 | The rest of Identity's first release that needs nothing from phase 2: ID-03, 04, 09, 11, 13, 14, 31, 32 | My account, passkeys, recovery codes and the owner's break-glass, staff merge (recovering a lost passkey, ID-08, is phase 2) | Identity's gate |

### Phase 2: a programme, a public site and messages

| Order | Stories | What it gives | Rests on |
| --- | --- | --- | --- |
| 1 | C-20 and C-21 (vocabularies), C-23 to C-25 (files; C-22 and C-26 are later), C-29 to C-31 (the rest of notifications) | Email and inbox, files, the term lists other modules use | Phase 1 |
| 2 | C-01 to C-13 (programme), C-16 to C-18 and C-48 (places and their access features) | The programme | Phase 1 |
| 3 | C-38 to C-47 except C-40 and C-44, UI-03, 09, 12, 15, 16 | The public site, search, audit reading and the remaining shell work | The public shell |
| 4 | ID-05, 06, 08, 12, 15, 16, 18 to 21, 24, 30, 35 | Guest accounts, the members' area, data download, erasure | Core's notifications and files; the production-team fact |
| 5 | C-49 to C-51 (webhooks, decided for the first release) | Outgoing webhooks | Events from every module |

### Phase 3: the box office

| Order | Stories | What it gives | Rests on |
| --- | --- | --- | --- |
| 1 | PAY-01 to PAY-07, FIN-01, FIN-02 | Payments with parts, cash and attested card, Stripe online, the ledger and period close | Phase 1; secrets only |
| 2 | BO-01 to BO-06 | Putting a show on sale | Core's performances and the booking-action and change points |
| 3 | BO-10, 12, 13 and the rest of BO-10 to BO-23 | Buying online, with the last-seat rule already proved | Identity's findOrCreateAccount; UI-20 |
| 4 | R-1 to R-7 | Reserve now, pay on arrival | Order 3 |
| 5 | BO-30 to BO-36 except BO-35; UI-20, 21 | The desk, including one payment for tickets and another module's lines, then the SumUp reader | Order 1 |
| 6 | BO-40 to BO-44; UI-05, 06, 10, 22, 23 | The door, live mode and offline scanning | Order 3 |
| 7 | BO-50 to BO-55, BO-60 to BO-63, FIN-03 to FIN-06 | Changes, refunds, self-service cancellation (off by default), waiting list, complimentary tickets, statements | Orders 1 to 3 |

Box office's own gate inside phase 3 is BO-10, 12, 13, 30, 40, 50, 51, PAY-05, FIN-01, FIN-02 and R-1 to R-7: a paid booking, a reservation, a refund and a period close that reconcile, with the last seat sold once. Its cut order, should the phase have to shrink, is the one you accepted in B9.

### After phase 3

Phase 4 holds the form builder's 31 first-release stories. Allocated seating (BO-70 to BO-72) and the later stories are unscheduled. Placements the first version of these tables missed: F-36 (rate limits in a shared store) is built in phase 1, before sign-in and public forms go live; F-37 (the signing service) is built in phase 3, before door codes; UI-10 is in phase 3; and ID-17 (emergency contacts and access needs) is first release, in phase 2 with the members' area. With Front of house's four stories and the bar's ten, phases 1 to 3 hold 209 stories.

## Findings from putting the six together

1. **Signing in needs an email before the notification pipeline exists.** Identity's gate sends a sign-in link in phase 1, but core's notification service is phase 2. The backlog pulls C-27, C-28 and C-32 (a module sends as part of its own save, retries, and the verified sending domain) into phase 1. Inbox, preferences and suppression stay in phase 2, because a transactional message has no preference switch.
2. **The shells need a little of core early too.** UI-01 needs the public shell, the navigation file and the brand from Core domain. C-35, C-36, C-37 and C-40 move to phase 1 with it, bringing the part of C-23 that uploads one file.
3. **The console shell comes before the Foundations screens.** Most of Foundations' first-release stories are console screens, so Interface's components are the first thing built after the kit.
4. **Three stories wait on modules from the second round and are built to work without them:** the on-shift bar and door check (UI-05, BO-44, ID-26) wait on Front of house's shift fact, and member pricing (BO-20) waits on Membership as a source for core.requirement (the earlier box-office.eligibility point is withdrawn).
5. **Releases arrive by hand at first.** You chose an update pull request in the theatre's repository, but the action that opens it (F-25) is a later story. Until then a theatre merges the release tag itself, which the owned-paths proof showed is clean.
6. **Nothing is left to settle between workstreams.** Identity has confirmed that a grant can be scoped to one production, which the production statement (FIN-04) needs. Interface has adopted the four changes Box office asked for on the desk and door screens, in its journeys and in the prototype.

One more finding came from the real deploy on 16 November. The Deploy to Cloudflare button created the database, bucket, key-value store and queue with nothing typed, but the copy it makes starts a fresh history and is not a GitHub fork. So there are two supported routes: the button, after which a script links the copy to upstream once (the new story F-35), or forking on GitHub and importing into Cloudflare, which is two steps and keeps GitHub's Sync fork. Upstream's default branch must therefore hold only tagged releases. Durable Object and dead-letter queue creation were not tested and are left to the build.

## Shared glossary

Each specification keeps its own glossary, in its tab 1. This section rules on the words that mean different things in different modules, and says who owns which words.

### Words with two meanings, and the ruling

| Word | Meanings | Ruling |
| --- | --- | --- |
| hold | Identity: a module stopping an erasure. Box office: seats kept for a basket | Always "erasure hold" or "seat hold" |
| claim | Identity: a person taking over an unclaimed account. Box office: one unit of capacity taken | "Account claim" and "capacity claim" |
| slot | Form builder: a place a host offers for a form. Core: a place a record offers for a file | "Form slot" and "file slot" |
| template | Form builder: a starting form. Core: the wording of a notification | "Form template" and "notification template" |
| draft | Core: a performance or production not yet scheduled. Form builder: a form version being edited, or an answer in progress | "Draft" alone only for core's state; "draft version" and "draft response" in forms |
| side | Identity and Core both use it for audience or members | One meaning; Identity owns it |
| state of a performance | Core: draft, scheduled, cancelled, completed. Box office: whether it is selling | "Performance state" is core's; "sale state" is Box office's |
| refusal | Foundations: a guard saying no. Interface: the page shown inside a shell | One idea at two levels. A person outside a shell sees "not found", never a refusal |
| access | Core: access features of a performance, and place access of a venue. Core files: file access | Always qualified, as written here |

### Who owns which words

| Owner | Words |
| --- | --- |
| Foundations | module, manifest, always-on, switchable, requires, uses, kit, unit of work, guard, refusal, point, contribution, event, internal event, listener, job, lane, task, external call, secret, credential, setting, quotable, ability, record type, fact, risk, fresh, realm, subject, data class, erasure behaviour, append-only, scoped id, prefix, owned path, override, preset, setup step, health check |
| Identity | account, unclaimed account, claimed, alias, tombstone, standing, side, assurance, fresh re-assertion, managed domain, role, grant, pending grant, scope, Owner, erasure hold, cooling-off, survivor |
| Core domain | production, performance, season, venue, space, closure, operating day, credit, advisory, access feature, place access, vocabulary, term, file slot, file access, notification, delivery, notification type, topic, transactional, sender identity, suppression, webhook, current and past production, booking action, public component |
| Box office, payments, finance | order, reservation, seat hold, capacity claim, pool, band, ticket type, ticket, desk code, booking reference, payment intent, part, attempt, attested card payment, till session, posting, entry, seal, period close, sale state, waiting-list entry, complimentary request |
| Form builder | form, version, draft version, draft response, response, revision, form slot, placement, stage, stage kind, transition, review, reviewer, conflict, custom fields, binding, bindable attribute, outcome action, form template, respondent, submitter, co-author, restricted answer, retention period |
| Interface | shell, live mode, account menu, Tonight, on-shift bar, the seven page types (List, Record, Form, Settings, Home, Steps, Live) and the Editor layout, status strip, queued act, not found, navigation group, saved view, primary action |

## The data model in numbers

| Owner | Tables | Where the list and id prefixes are |
| --- | --- | --- |
| Foundations (core) | 13 | Foundations, tab 2, "The tables foundations owns" |
| Identity (core) | 18 | Identity, tab 2, "Id prefixes" |
| Core domain (core) | 26 | Core domain, tab 2, "All 26 tables and their id prefixes" |
| Box office | 22 | Box office, tab 2, "Id prefixes" |
| Payments | 9 | Box office, tab 2 |
| Finance | 7 | Box office, tab 2 |
| Form builder | 17 | Form builder, tab 2, "Id prefixes" |
| Interface (core) | 3 | Interface, part 2; one id prefix, svw, for core\_saved\_views |
| **All** | **115** | The one index of id prefixes, points, record types and facts is Foundations, tab 4 |

Every id is a short table prefix and 26 characters, sortable by creation time. An id is never a secret: anything that grants access by being known is a separate random token stored hashed.

## Second round additions (16 November 2026)

Six more modules now have specifications, and their stories add to the totals above. The questions they raise are in the tab "Second round: questions and status".

| Module | Stories | Gate | First release | Later | Tables |
| --- | --- | --- | --- | --- | --- |
| Front of house (FH) | 46 | 4 | 31 | 11 | 17 |
| Spaces (SP) | 48 | 4 | 32 | 12 | 7 |
| Bar (BAR) | 44 | 8 | 26 | 10 | 20 |
| Training (TR) | 34 | 0 | 24 | 10 | 12 |
| Membership (two modules) | 55 | 9 | 33 | 13 | see the specification |
| Communications (COM) | 38 | 6 | 18 | 14 | 9 |

That was 265 more stories at the time, 532 in all with the first round's 267; the table at the top of this tab has the current figures (Interface grew from 34 to 36 with the Calendar and LiveKeypad components, UI-35 and UI-36).

### Changes to the order of work

- FH-01 to FH-04 (the facts that say who is on shift tonight) join phase 3, because Box office's desk authority rests on them.
- Decided (X1): BAR-01 to 05, 10 to 12, 14 and 22 join phase 3 after Box office's desk stories, with UI-36, so one card-reader payment can cover tickets and drinks.
- Decided (X4): FB-501, FB-502, FB-503 (record mode) and FB-506 (outcome actions) move forward with Membership as the first host.
- Phase 2 gains three proofs for notifications and mailings: 50 sends recorded in one D1 batch, a 10,000-recipient mailing, and what Cloudflare Email Sending reports for bounces, complaints and volume. The last was answered the same day from Cloudflare's documentation and is still to be proved on a real sending domain; the 10,000-recipient proof waits for mailings, which are not in the first release.
- Everything else in the six modules follows phase 3 in an order still to be set once the questions are answered.

### Rulings added to the glossary

- One mechanism, `core.requirement`, answers "does this person meet this condition at this time" for every module; the host module owns the refusal and any override.
- Preset roles stay at fifteen (the fifteenth is welfare-lead). Training adds none: managing maps to technical-manager and administrator, and a trainer is the fact `training.course-trainer` on a course.
- A membership holder has a standing; a supporter does not. Say "membership holder", "scheme year" and "membership period", never a bare "term" or "period". "Member" stays Identity's word.
- Say "room booking" across modules, "course" (not training module), "training record" in full, "rota place", "session waiting list", "duty" (never role) on a rota, "tranche" (not batch) in Communications, and "bar sale", "opening", "outlet", "parked sale", "stock item" and "bar tab" at the bar.
- Templates are always named in full: form template, notification template, mailing template, rota template.
- Finance has no income-recognition rule of its own. Each module decides for its own income; "at the performance" binds tickets only.

### The kit as built (16 November 2026)

The foundation kit (F-01 to F-10 and F-34) is built and up for review as [pull request 2](https://github.com/MattA-Official/proscenium/pull/2). Eleven points were settled while building and are listed as "As built" at the end of the Foundations specification's Formats tab, which prevails over older wording. The ones every module meets: `defineTable(name, columns, options)`; the content token is `:setting{name="..."}`; points are read with `usePoint(name)`; external calls are declared in a manifest `calls` section; a switched-off module's jobs wait; and naming patterns for settings, abilities, events and jobs are enforced. One story was added, F-36 (first release): rate limiting in a shared store for sign-in and public forms. Foundations is now 36 stories, so the total is 533.

### Counts after Matt's answers (16 November 2026, 16:15 GMT)

Matt's answers changed several specifications, so these figures replace the ones above. Each specification's own backlog tab is the authority for its stories.

| Workstream | Stories | First release (including gate) | Later |
| --- | --- | --- | --- |
| Foundations | 37 (F-36 rate limiting in a shared store and F-37 a signing service added) | 35 | 2 |
| Form builder | 43 (FB-511 and FB-512 split out) | 31 | 12 |
| Bar | 48 (staff and floating bar tabs added) | 39 | 9 |
| Membership | 58 (card, scheme lengths, reference without an account) | 49 | 9 |
| Communications | 38 (no mailings in the first release) | 21 | 17 |

With Identity 45 (ID-38 to ID-45 added for the access scheme on 16 November), Core 52 (C-52, automatic sending-domain setup, added at Matt's request on 16 November), Box office 69 (BO-24, one hold extension, and BO-45, the requirement checked at entry, were added in the consistency review), Interface 36, Front of house 46, Spaces 48 and Training 34, the total is 554 stories.

Decided changes to the order of work: the ten bar stories join phase 3 after BO-30 to BO-36; FB-501, FB-502, FB-503 (record mode) and FB-506 (outcome actions) come forward with Membership as their first host, in that build order; anything that cited FB-506 for "creates a production" now cites FB-512, and custom fields on a production, person or venue cite FB-511. Phase 2 keeps two notification proofs (a tranche of 50 in one D1 batch, and Cloudflare's bounce and complaint events reaching a Worker with the message id); the 10,000-recipient proof waits for mailings.

New shared mechanisms since the first round: presented values and a summary line on `core.requirement` answers; the code point `box-office.door-code` with door codes of the form `<kind>.<key id>.<code>.<signature>`; the kit's signing service; a queue for Cloudflare's email events; and Interface's rule that a screen's shell follows whose business it does, never what guards it.

### After the consistency review (16 November 2026)

A read-through of the paper and the first six specifications against each other produced a numbered worklist, W-001 to W-265. The rulings that settle the items touching more than one document are numbered R-01 to R-28 and kept with the worklist in the repository under `docs/consistency-review/`. Three points belong in this tab:

- **The glossary's rulings bind prose, not table or column names.** "Erasure hold" and "seat hold", "account claim" and "capacity claim", "draft version" and "draft response" are how documents and screens speak; a table may still be called `holds` or `claims`.
- **Gate stories are named in two places.** The gate lists in this tab are the authority; Foundations and Identity mark the same stories in their own story tabs.
- **Three choices were made by integration and reported to Matt:** one setting for the committee year end (`core.organisation.year-end`); emergency contacts and access needs in the first release (ID-17); and the whole review panel, not only the chair, seeing a form's review summary after release.
