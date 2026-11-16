# Consistency worklist, 16 November 2026

Each item is a finding from the consistency review (see README.md), numbered W-001 onwards and grouped by the document that should change it. The 'Finding' column gives the file and number in this folder, where both sides are quoted with line numbers. Tick an item off when the Doc is fixed. Severity: HIGH would cause a build error or wrong design decision; MEDIUM is confusing or likely to be copied wrongly; LOW is wording, counts or typos.

Where the review marked a finding 'unclear: needs Matt', do not choose silently: raise it with the Integration thread.


## Foundations (45 items)

| # | Severity | Finding | What to fix | Settle by |
| --- | --- | --- | --- | --- |
| W-001 | HIGH | [forms 7](forms.md) | Foundations index of facts and record types for forms is stale. | forms (owning workstream's document is the authority, per foundations 06:44). Update the index row to list the three facts. |
| W-002 | HIGH | [foundations 1](foundations.md) | Organisation and locale settings exist three times | core domain (3). It owns the organisation and the calendar helper (`operatingDayOf`, `dayBounds`), and the interface already defers to it. The time-zone default also differs (`Europe/London` vs unset); core's "unset until setup" matches the Setup screen, which … |
| W-003 | HIGH | [foundations 3](foundations.md) | Fresh-sign-in window: two keys, two defaults | identity (owner of assurance and fresh re-assertion, per `F:02-3-abilities-registry.md` "Who owns what" and the `fresh` ruling), and Matt's accepted I12. |
| W-004 | HIGH | [foundations 8](foundations.md) | Backups are relied on everywhere and specified nowhere | the paper and identity (both treat it as foundations' job). **Fix:** foundations adds a task `core.backup`, a retention setting (e.g. `core.backups.retention`), a pre-migration backup step in G1, a health check, and a story; or the paper drops the claim (needs … |
| W-005 | HIGH | [identity 2](identity.md) | Two settings for the fresh-proof window, with different defaults | identity owns re-assertion (foundations 02-3 "Who owns what") and Q12 settled 10 minutes. |
| W-006 | HIGH | [identity 7](identity.md) | Foundations relies on a "data-protection lead" role that identity does not define | identity (it owns preset names; status tab and backlog fix the count at fifteen). |
| W-007 | HIGH | [identity 9](identity.md) | Identity's facts API cannot be implemented from the foundations fact format (`holdersOf`) | foundations' format must grow, since identity's services are agreed in core, box office and the interface. |
| W-008 | HIGH | [interface 8](interface.md) | `core.account-section` has two owners and two shapes | one definition is needed from an integrator. Suggested: interface owns the point (as the index says) and adds `side`, `ability`, `component`, with `to`/`icon` optional, and a second target (`account` or `console-person`). Identity removes it from its "Points o … |
| W-009 | MEDIUM | [box-office 29](box-office.md) | Retention settings still describe data the orders no longer hold | the accounts ruling. Either drop these three settings or restate what the sweep does (for example: unclaimed accounts are anonymised by identity's `core.retention.unclaimed-after`; order retention governs when the access note, token hashes and attendee names a … |
| W-010 | MEDIUM | [core 17](core.md) | Core contributes to `communications.audience-source`, but the core never lists or imports a module | unclear, needs a foundations ruling. Owner: foundations 1/4; core 4 and identity 4. |
| W-011 | MEDIUM | [forms 17](forms.md) | Abilities table does not use the foundations listing format and omits risk and audit. | foundations format. Add the missing columns (and decide the privileged set, since privileged implies a fresh strong sign-in, which a welfare lead will notice). |
| W-012 | MEDIUM | [foundations 10](foundations.md) | Points index is incomplete | see finding |
| W-013 | MEDIUM | [foundations 11](foundations.md) | Core domain declares a second module, `public-site`, that foundations does not know | unclear, needs a decision by the integrating thread (the catalogue `design-paper/04-2-module-catalogue.md:20` lists Public site as a switchable module needing Core, which supports core domain). **Fix:** foundations states that the core domain area holds two mo … |
| W-014 | MEDIUM | [foundations 12](foundations.md) | A public route is declared three ways | the registry tab and identity (two values, `public` and `signed-in`). **Fix:** one form in R1, F-04, the kit row and the test plan; add `signed-in`. |
| W-015 | MEDIUM | [foundations 13](foundations.md) | Function and token names disagree with the "As built" list | see finding |
| W-016 | MEDIUM | [foundations 14](foundations.md) | Settings audience value `internal` does not exist | see finding |
| W-017 | MEDIUM | [foundations 15](foundations.md) | Rate-limit setting keys | see finding |
| W-018 | MEDIUM | [foundations 16](foundations.md) | A switched-off module's queued jobs: still run, or wait? | M4 and the as-built list. **Fix:** change the table row in the manifest tab. The booking-email example is exactly why the owning modules (box office, forms) should check whether they are happy with it; box office's `payments.settlement` and ticket emails depen … |
| W-019 | MEDIUM | [foundations 17](foundations.md) | Status statements in the overview, formats tab and proofs are stale or disagree | see finding |
| W-020 | MEDIUM | [foundations 18](foundations.md) | Code samples in the format tabs still use superseded forms | see finding |
| W-021 | MEDIUM | [foundations 19](foundations.md) | The worked example breaks the rule it teaches | see finding |
| W-022 | MEDIUM | [foundations 20](foundations.md) | Encryption keys and core secrets | unclear: either `col.special()` always uses `CORE_ENCRYPTION_KEY` (then `CORE_PROFILE_KEY` goes), or foundations lets a module bring its own versioned key. Needs a ruling. **Fix:** one sentence in the data-class tab; foundations 08 says the secrets table is co … |
| W-023 | MEDIUM | [foundations 22](foundations.md) | Reserved address prefixes are listed four different ways | the ruling log. **Fix:** one canonical list in the manifest tab; the others link to it; interface drops `/whats-on` from "anything not reserved". |
| W-024 | MEDIUM | [foundations 23](foundations.md) | Interface says three shells; foundations says four "shells" | interface (owner; Matt's U1). **Fix:** foundations calls the manifest field values "menus" (or "destinations") and says there are three shells plus live mode; or rename the field. Foundations 07 "the console shell" stays. |
| W-025 | MEDIUM | [foundations 24](foundations.md) | Foundations' stale references to "one queue" and to the bindings | see finding |
| W-026 | MEDIUM | [foundations 29](foundations.md) | Foundations 02-1: a theatre module path and a few late fields | see finding |
| W-027 | MEDIUM | [identity 23](identity.md) | Foundations' audit table declares `move` on an append-only column | the formats ruling: `alias`. |
| W-028 | MEDIUM | [interface 10](interface.md) | Three interface points missing from foundations' index; counts of points | foundations' index should gain the three; IF 04 should say "nine points, plus two ... plus the group declaration" or restate the count. Owner: IF 04:3, FND 06. |
| W-029 | MEDIUM | [interface 12](interface.md) | `core_saved_views.id` has no prefix; foundations' prefix index lacks interface's tables | foundations rule. Add a prefix (e.g. `svw`) and register it; update 02:5. Also naming: FND 02-formats.md:107 says interface is an area named `core.interface.*`, but IF's settings are `core.shells.*`, `core.appearance.*`, `core.lists.*`, `core.live.*`, `core.la … |
| W-030 | MEDIUM | [interface 15](interface.md) | Console groups: no home for core's, foundations' and forms' screens | interface owns the group list, so amend it to name the group for programme (Productions/Programme), places, files, messages, and rename "Site settings" or "System" so foundations' routes (`/console/system/...`) and group agree. The build check at 04:59-60 cann … |
| W-031 | MEDIUM | [interface 20](interface.md) | Public routes outside the reserved list: `/orders/<token>`, `/passes` | foundations' ruling. Move BO's pages under `/book` or `/account` (e.g. `/account/orders/<token>`? that needs sign-in; so `/book/order/<token>`) or add them to the reserved list; fix the example. Owner: BO 06, IF 05-1, FND 12-1. |
| W-032 | MEDIUM | [paper 16](paper.md) | Backups and migration failure behaviour. | the paper states a commitment no spec delivers, and the migration behaviour contradicts. Decision needed: either add backup stories and a setting in Foundations (and the retention setting Identity points at), or drop the claims. Behaviour on failure: Foundatio … |
| W-033 | LOW | [box-office 50](box-office.md) | Foundations examples now wrong for box office | BO. Owner: FND 02-formats, 02-4. |
| W-034 | LOW | [foundations 30](foundations.md) | Setup presets named differently | see finding |
| W-035 | LOW | [foundations 31](foundations.md) | Realm values | see finding |
| W-036 | LOW | [foundations 32](foundations.md) | `core_jobs` states and `core_task_runs` columns | see finding |
| W-037 | LOW | [foundations 33](foundations.md) | Table naming rule vs foundations' own tables | see finding |
| W-038 | LOW | [foundations 34](foundations.md) | Lanes not declared on export jobs | see finding |
| W-039 | LOW | [foundations 35](foundations.md) | Settings screen wording uses `change:` for something else | see finding |
| W-040 | LOW | [foundations 37](foundations.md) | Interface's settings and abilities tables are not in the registry layout | see finding |
| W-041 | LOW | [foundations 38](foundations.md) | Stale "draft 1" and "sub-tab empty" status in other specs | see finding |
| W-042 | LOW | [foundations 39](foundations.md) | Examples that differ from the owning specification | see finding |
| W-043 | LOW | [foundations 40](foundations.md) | Identity intro counts | see finding |
| W-044 | LOW | [foundations 41](foundations.md) | Paper wording that predates foundations | see finding |
| W-045 | LOW | [identity 39](identity.md) | Identity's setup step does not mention the setup code | see finding |

## Core domain and public site (46 items)

| # | Severity | Finding | What to fix | Settle by |
| --- | --- | --- | --- | --- |
| W-046 | HIGH | [core 1](core.md) | Side value: `member` (core) against `members` (identity, glossary, shells) | identity (owns "side"). Fix: change every core `side` value and the notification type tables to `members`, and change `found/02-4-data-class-registry.md:66` to `members` so that realm and side share one vocabulary. A8 in `core/02-scope.md` should then be marke … |
| W-047 | HIGH | [core 2](core.md) | Organisation and locale settings duplicated in foundations and core, with different keys, defaults and audience | foundations (the kit is built and J6 depends on it). Fix: core drops `name`, `time-zone`, `currency`, `locale` and `day-rollover` and keeps only the genuinely additional `core.organisation.*` keys (short-name, week-start, country, contact details, social links … |
| W-048 | HIGH | [core 4](core.md) | Default colour mode declared twice (and the paper says it is one control) | the U6 decision (interface). Fix: core removes `core.brand.default-mode` or the interface removes `core.appearance.default`; keep one set of values. |
| W-049 | HIGH | [core 5](core.md) | Content token written `:setting{key=...}`; the as-built kit says `name` | foundations as-built. Fix core 4 (token, component property, C-41, test "The unknown token"). Note foundations' own `02-2-settings-registry.md:92`, `05-states-and-rules.md:132` (R4) and `09-stories.md:42` (F-22) still say `key`; they should be brought into lin … |
| W-050 | HIGH | [core 6](core.md) | Nullable account subjects without the required `unlinked` declaration | foundations. Owner: core 2. |
| W-051 | HIGH | [core 7](core.md) | Settings, ability and screens that other core tabs depend on are not in the settings and abilities tab | the data-model and decision text (Matt's decisions). Owner: core 4, 5, 6. |
| W-052 | HIGH | [foundations 6](foundations.md) | Foundations' own ability table breaks the registry rules it states | the registry tab. **Fix:** rewrite the table with `risk: normal\|privileged`, `owner` blank or `ignored` for all (none of these records has an owner), and say that `privileged` gives strong assurance and a fresh sign-in by default. Re-word M7 and the test-plan … |
| W-053 | HIGH | [identity 5](identity.md) | The `side` value is `members` in identity and `member` in core and foundations | glossary ruling (identity owns "side") and core's own scope note: `members`. |
| W-054 | HIGH | [identity 6](identity.md) | Year-end expiry has no data source: core offers no "current year ends on" | unclear: needs Matt or the integrating thread. The paper requires the pattern, and core does not declare it. |
| W-055 | HIGH | [interface 3](interface.md) | Default colour mode and language: three owners | see finding |
| W-056 | HIGH | [interface 9](interface.md) | A production page's extra content: `core.record-tab` against `core.production-section` | unclear; needs Matt or the integrating thread. Recommended: keep interface's `core.record-tab` (generic, covers every record type), delete `core.production-section` from core (core can still contribute a card to the Dates tab), and amend core's tab list to mat … |
| W-057 | MEDIUM | [box-office 17](box-office.md) | Core's change-guard cannot "collect a decision"; two flows for a cancelled performance | unclear; needs integration. Simplest: guard refuses until the box office's own screen has recorded a decision for that performance (a small decision record owned by BO), the person opens that screen from the refusal's link, and `core.performance.cancelled` the … |
| W-058 | MEDIUM | [box-office 18](box-office.md) | Capacity is owned twice, and core's capacity events and reinstatement are not handled | core owns the performance's capacity field; BO owns pools. Specify the relationship (pools sum is bounded by `capacityOf`; core's change is guarded through `change-guard` and counts from `salesSummary`), and add the three heard events. |
| W-059 | MEDIUM | [box-office 19](box-office.md) | Messaging: BO routes through "the communications service" but core owns notifications; core's guest-booking text is stale | core's `notify` and `core.notification-type` (owner of messaging; Communications is for mailings). Fix BO 05:164 and add the type contributions. Core's line 275 should say only a waiting-list entry (and a no-account desk sale, which gets nothing) uses `notifyA … |
| W-060 | MEDIUM | [core 8](core.md) | Two points for "a module adds a panel to a core record page" | the interface's generic `core.record-tab` (works for every record type, and two other specs already contribute to it). Fix: core drops `core.production-section` (or defines it as a thin alias) and its screens/wireframe read `core.record-tab`; foundations index … |
| W-061 | MEDIUM | [core 9](core.md) | "Suggested holders" are not preset roles | identity's preset keys. Fix: core maps each ability to preset keys (for example `production-lead` on a production, `administrator`, `communications-officer` for publish), or asks identity for a programming role (the paper holds the count at fifteen, `paper/12- … |
| W-062 | MEDIUM | [core 10](core.md) | Inbox and notification preferences: no declared contribution to `core.account-section`, and ownership claimed in three places | see finding |
| W-063 | MEDIUM | [core 12](core.md) | `notifyAddress` for "a guest booking" against identity's ruling that guests are accounts | identity. Owner: core 2 (A6), core 4. |
| W-064 | MEDIUM | [core 15](core.md) | Forms keeps a label snapshot where core says a record never stores the label | unclear, needs a one-line ruling. Suggest core states the exception for immutable submitted records (answers, order lines), or forms drops the snapshot. |
| W-065 | MEDIUM | [core 18](core.md) | Bounce and complaint handling is built on a queue and task that core does not list, and its status text is stale | see finding |
| W-066 | MEDIUM | [core 19](core.md) | Webhook delivery mechanism does not fit the event model | see finding |
| W-067 | MEDIUM | [core 20](core.md) | Merge handler for notification preferences is not contributed | see finding |
| W-068 | MEDIUM | [core 21](core.md) | Starter site and content configuration differ from foundations; a "pending proof" is now proved | see finding |
| W-069 | MEDIUM | [core 22](core.md) | Public component names are not module-prefixed | see finding |
| W-070 | MEDIUM | [core 23](core.md) | A cancelled production is "past" only in a side note | see finding |
| W-071 | MEDIUM | [core 24](core.md) | Screen inventory misses screens that other tabs require | see finding |
| W-072 | MEDIUM | [core 25](core.md) | "Season pattern" is promised and never specified | see finding |
| W-073 | MEDIUM | [core 26](core.md) | Part 4 lists omit things declared in part 2 | see finding |
| W-074 | MEDIUM | [core 27](core.md) | Encrypted "internal" columns have no helper; the credentials store exists | see finding |
| W-075 | MEDIUM | [identity 20](identity.md) | Preset roles named by other specs do not exist | identity's list (agreed as the one list; foundations `02-1:220`). |
| W-076 | MEDIUM | [interface 16](interface.md) | First-run setup: five steps against six; wizard content differs | foundations owns Setup (the interface only draws it). Reconcile the three: IF journey 9 and 05-screens "First-run setup" must follow FND 07 (including "language", presets, and "Check") and either use the Steps page's 5-step cap or note the exception. Owner: IF … |
| W-077 | LOW | [core 28](core.md) | Same event named two ways | see finding |
| W-078 | LOW | [core 29](core.md) | `complained` has no transition | see finding |
| W-079 | LOW | [core 30](core.md) | Cancelling a production cannot cancel its draft performances | see finding |
| W-080 | LOW | [core 31](core.md) | Stale "departs from the paper" wording; the paper has been amended | see finding |
| W-081 | LOW | [core 32](core.md) | Test plan still hedges on a decided question | see finding |
| W-082 | LOW | [core 33](core.md) | Whether `/whats-on` and `/shows` are reserved | see finding |
| W-083 | LOW | [core 34](core.md) | Record type declarations that do not fit the format | see finding |
| W-084 | LOW | [core 35](core.md) | Venue and space cannot be a grant scope as identity expects | see finding |
| W-085 | LOW | [core 36](core.md) | Counts and totals | see finding |
| W-086 | LOW | [core 37](core.md) | Backlog puts two "Later" stories in the phase-2 build order | see finding |
| W-087 | LOW | [core 38](core.md) | Broken code-span rendering | see finding |
| W-088 | LOW | [core 39](core.md) | What's-on filters and component list differ from the paper | see finding |
| W-089 | LOW | [core 40](core.md) | First-run wizard steps differ | see finding |
| W-090 | LOW | [core 41](core.md) | "All or nothing" run of 200 performances against the unit limit | see finding |
| W-091 | LOW | [core 42](core.md) | Booking action per date against a production-level button | see finding |

## Identity (36 items)

| # | Severity | Finding | What to fix | Settle by |
| --- | --- | --- | --- | --- |
| W-092 | HIGH | [foundations 7](foundations.md) | "Data-protection lead" is a role identity never defines; the System screens sit at addresses the interface rule refuses | interface (owner of the shell and navigation checks). **Fix:** one group name and one address pattern for foundations' screens; adjust foundations 07 and the contributions it makes to `core.navigation`. |
| W-093 | HIGH | [identity 1](identity.md) | Non-members at a members' address: "not found" versus a "for members" page | the recorded decision (Q3 A / I3). |
| W-094 | HIGH | [identity 4](identity.md) | Account `origin` enum lacks a value identity itself uses | tab 4 and box office, since they describe a behaviour a person needs (service-messages-only for named people). |
| W-095 | HIGH | [identity 8](identity.md) | `core.account-section`: owner, shape and scope disagree | unclear: needs integration. Foundations' index says interface owns the name. Identity needs the console variant. |
| W-096 | MEDIUM | [core 11](core.md) | Notification types that identity and foundations need are declared nowhere | see finding |
| W-097 | MEDIUM | [foundations 21](foundations.md) | First-run setup is described three ways | identity for the Owner step (security rule); foundations owns the sequence and the setup code. **Fix:** foundations 07 lists the full sequence once, naming the step each other workstream contributes (identity's Owner step, core's brand step through `core.setup … |
| W-098 | MEDIUM | [identity 10](identity.md) | Pronouns: promised in a story and a wireframe, excluded elsewhere | scope and data model (form builder owns them). |
| W-099 | MEDIUM | [identity 11](identity.md) | Emergency contacts and access needs: "later" in stories, first release everywhere else | unclear: needs Matt or the integrating thread. Forms and front of house both asked for the welfare holder (`07:166`), which implies first release. The backlog (`12-build-backlog`, 7 later stories) places ID-17 as later. |
| W-100 | MEDIUM | [identity 12](identity.md) | Recovery codes: required for every first passkey, or only for Owners? | states-and-rules (and ID-37 for Owners); ID-03 should say "offers". |
| W-101 | MEDIUM | [identity 13](identity.md) | Welfare lead missing from the "Suggested holders" column | the "fifteenth preset role" text, since it was added later for these abilities. |
| W-102 | MEDIUM | [identity 14](identity.md) | Retention screen names the wrong ability to arm | tab 6 (07), the abilities table. |
| W-103 | MEDIUM | [identity 15](identity.md) | Turnstile secret: name and optionality disagree | `CORE_TURNSTILE_SECRET_KEY`, owned by core. |
| W-104 | MEDIUM | [identity 16](identity.md) | Encryption key for access profiles: `CORE_PROFILE_KEY` or `CORE_ENCRYPTION_KEY` | foundations: one platform key and one rotation procedure, using `col.special()` rather than a bespoke payload column. |
| W-105 | MEDIUM | [identity 17](identity.md) | Data model is not written in the foundations layout, and says it will be re-cut | foundations format. |
| W-106 | MEDIUM | [identity 18](identity.md) | "Privileged" does not imply "fresh" in identity; it does in foundations | identity's refinement is sensible, but must be declared. Foundations' default needs `fresh: false` on read abilities. |
| W-107 | MEDIUM | [identity 19](identity.md) | "Benefits service" is stale: box office uses `core.requirement` | foundations ruling on `core.requirement`. |
| W-108 | MEDIUM | [identity 21](identity.md) | Form builder expects identity to contribute `forms.bindable`; identity does not | unclear: needs integration. Form builder has recorded it as settled. |
| W-109 | MEDIUM | [identity 22](identity.md) | Unclaimed retention: two different rules | tab 3 and settings. |
| W-110 | MEDIUM | [identity 24](identity.md) | "Unassigned audit service": stale | foundations ruling. |
| W-111 | MEDIUM | [identity 25](identity.md) | Wrong cross-reference: passwords are question 4, not question 1 | tab 9. |
| W-112 | MEDIUM | [identity 26](identity.md) | `core.signed-in` is used as an ability; foundations says it is a route declaration | foundations' navigation format. |
| W-113 | MEDIUM | [identity 27](identity.md) | Unverified address rules contradict guest checkout | the guest-checkout behaviour (decision Q1). |
| W-114 | MEDIUM | [identity 28](identity.md) | `core_fact_abilities` key and prefix note count two columns, but the key has three | `:234` (the later ruling). |
| W-115 | MEDIUM | [identity 29](identity.md) | Anonymous desk sale: raised, never answered | unclear: needs identity to answer. Likely: an order with no buyer needs no account, and the order's subject is `none`. |
| W-116 | MEDIUM | [identity 30](identity.md) | Duplicate-suggestion behaviour in the paper has no home | unclear. The paper is a statement of intent; the spec may be narrower. |
| W-117 | MEDIUM | [identity 32](identity.md) | Merge naming: winner and loser versus survivor | glossary: "survivor". |
| W-118 | LOW | [foundations 36](foundations.md) | Foundations' count of screens and "Owner" role wording | see finding |
| W-119 | LOW | [identity 33](identity.md) | Microsoft in the paper's sign-in list | see finding |
| W-120 | LOW | [identity 34](identity.md) | Ability count in the intro: 16 versus 17 | see finding |
| W-121 | LOW | [identity 35](identity.md) | Preset role count in the overview: 14 versus 15 | see finding |
| W-122 | LOW | [identity 36](identity.md) | Primary address wording | see finding |
| W-123 | LOW | [identity 37](identity.md) | Placeholder name for an erased person | see finding |
| W-124 | LOW | [identity 38](identity.md) | Interface says My account is shown "Always" | see finding |
| W-125 | LOW | [identity 40](identity.md) | Foundations still lists preset role names as open | see finding |
| W-126 | LOW | [identity 41](identity.md) | "My account" `core.account.merged` payload and claim event timing | see finding |
| W-127 | LOW | [interface 31](interface.md) | Smaller wording and rendering items | see finding |

## Box office, payments and ledger (41 items)

| # | Severity | Finding | What to fix | Settle by |
| --- | --- | --- | --- | --- |
| W-128 | HIGH | [box-office 1](box-office.md) | Reserved order's claims vs the settle batch | the reservation rules are newer and are the intent. Decide and write down the claim state and hold kind of a reserved order (either `confirmed` with no expiry, as :66 says, or a new hold kind). Then change step 4 to "guarded on `held` or, for a reserved order, … |
| W-129 | HIGH | [box-office 2](box-office.md) | The refund CHECK forbids the self-approve limit | the decided behaviour (Q5 A). Replace the CHECK with a guard in the transition, for example a guard row or trigger that reads the limit stored on the refund when it is requested, or let the requester equal the approver only when `approved_by` is recorded with  … |
| W-130 | HIGH | [box-office 3](box-office.md) | Refund counter trigger subtracts on `declined` | the state table (04). Fix the trigger to "`failed` subtracts" and say which trigger keeps the part counter. |
| W-131 | HIGH | [box-office 6](box-office.md) | Nullable account subject on orders needs `unlinked`, and the "anonymous desk sale" is still described as unresolved | Foundations' schema check, plus Identity's existing no-address account. Either declare `unlinked` on `box_office_orders` and list it in Identity's manual-step checklist, or drop the exception and make a desk sale with no details use an unclaimed no-address acc … |
| W-132 | HIGH | [box-office 7](box-office.md) | `payments_intents` still carries owner columns, and the base service and point contracts predate parts | the later (parts) design, since Bar and Membership contract against it. Rewrite the intents table, `createIntent` (takes `parts`), the first settlement row, `requestRefund` (takes `partId`) and the test wording ("leave `open`"). Restate where the one-open-inte … |
| W-133 | HIGH | [box-office 8](box-office.md) | Id-prefixed secret: ticket code stored in the clear | Foundations rule and BO's own :59. Rename to `code_hash` (tickets and passes) and say how the server finds a ticket from a scanned code (hash then look-up). |
| W-134 | HIGH | [forms 1](forms.md) | Checkout questions: name, kind, direction and subject all differ between forms and box office. | unclear, needs Matt/integration. Suggest the forms slot model wins (it is the generic one and keeps the dependency pointing from host to forms). Box office should drop its own point, declare a record type `box-office.ticket-type` (or settle on production), and … |
| W-135 | HIGH | [interface 5](interface.md) | Door route and shell: console in box office, live in the interface | interface (the ruling of 16 November). Box office should move Door to `/live/box-office/door/<performance>` with shell `live` and contribute the tile; keep the printable door list in the console. Owner: BO 05, BO 06 (also the "Console shell: the door" heading) … |
| W-136 | MEDIUM | [box-office 9](box-office.md) | Stale counts and statuses in the overview and elsewhere | the content. Overview should say 38 tables, 67 stories (61 in the first release), a real count of never-regress cases (68 in part 8 alone; 75 with the part 4 additions, once they are moved into part 8), 11 questions. Part 9 line 5 "Nine questions" to "Eleven". … |
| W-137 | MEDIUM | [box-office 11](box-office.md) | "Waits on / assumed / open" statuses that other documents have closed | Foundations rulings and the later specs. Reword to "agreed"/"ruled", delete the three resolved points, and add `credentials` (optional) to the provider contract. |
| W-138 | MEDIUM | [box-office 12](box-office.md) | `externalCall` is the one allowed self-committing exception, but BO declares two others | Foundations. `startAttempt` should use `externalCall` for the provider call (declared in a manifest `calls` entry); `answerAttempt` should take the caller's unit of work (the webhook job creates it). BO does not declare any `calls`. |
| W-139 | MEDIUM | [box-office 14](box-office.md) | Removed income setting is still described | the decision (Q4 A, fixed rule). Delete the row and the sentence; correct :77. |
| W-140 | MEDIUM | [box-office 15](box-office.md) | `payments.refund.request` names a Box office record; owner-neutral refund abilities are incomplete | BO/05 (owner-neutral Payments). Make `payments.refund.request` act on `payments.session`-style neutral record or none, declare `box-office.order.refund` and `box-office.ticket-type.override-requirement` in part 6, and decide how `order.cancel` relates to `orde … |
| W-141 | MEDIUM | [box-office 16](box-office.md) | Preset roles are published but Box office maps nothing to them | Identity's keys. BO presets (per `student-society`, `amateur-company`, `small-venue`) should map abilities to those keys; replace "Treasurer; duty manager; marketing" with role keys or facts. |
| W-142 | MEDIUM | [box-office 22](box-office.md) | Undefined service `collect` and unaccounted `finance.system-account` model | part 4's later contract (modules declare accounts). Add the `module` column to part 2, rename system keys to `<module>.<key>`, say who owns each account, and name the online counterpart of the desk basket (`createIntent` with parts, or a new `collect`). Also t … |
| W-143 | MEDIUM | [box-office 24](box-office.md) | `core.account.merged` listener contradicts the declared merge, and a waiting-list row has no account | Identity's column declarations. Delete the listener or say it does nothing; waiting-list rows are not moved. |
| W-144 | MEDIUM | [box-office 26](box-office.md) | Jobs and tasks list is incomplete, and jobs and tasks are mixed | Foundations vocabulary. Add the two reservation tasks and an intent-expiry task to part 4, call them tasks, and pick one trigger for income recognition. |
| W-145 | MEDIUM | [box-office 27](box-office.md) | Events list: `box-office.order.reserved` missing from the tables that must state it | Foundations rule E6/E7 (every announced event states `internal`). Add the row to both tables and state how reservation cancel and release announce. |
| W-146 | MEDIUM | [box-office 28](box-office.md) | Attempt state diagram versus reader cancel | the screen and provider contract. Add `pending -> cancelled` (provider confirmed stop) to the diagram and the state trigger text (03:504), and say what happens if the reader answered "paid" first. |
| W-147 | MEDIUM | [box-office 32](box-office.md) | Core's `core.booking-action` state mapping is incomplete | Core's five states. Add the mapping table (draft: absent; paused: `closed` with its own label or `limited`?) in BO 05. |
| W-148 | MEDIUM | [box-office 33](box-office.md) | Scope refers to content that does not exist | the content. Add the backlog rows (or point to the paper) and add a voucher line kind or drop "both". |
| W-149 | MEDIUM | [box-office 34](box-office.md) | Cut order omits the reservation stories that the backlog calls gate | backlog and the story list (R-1 to R-7 are gate). Add R-1 to R-7 to "Not to be cut" and reword cut 4 so it cannot cut the reservation path. |
| W-150 | MEDIUM | [box-office 35](box-office.md) | Other settings and kinds not in Foundations' format | Foundations settings format. Re-express as `duration` settings in the standard table, and give the hold extension a row, a story and a test. |
| W-151 | MEDIUM | [box-office 36](box-office.md) | Hold-extension and expiry story text | see finding |
| W-152 | MEDIUM | [box-office 37](box-office.md) | Term used for "consent held by the core" | Communications. Fix 08. |
| W-153 | MEDIUM | [box-office 38](box-office.md) | Overview diagram says Box office posts to the ledger; part 4 says Payments writes the posting | part 4. Rewrite key line 4 to "Box office returns the entries for sales and refunds; Payments writes the one sealed posting; Box office posts earned income itself". |
| W-154 | MEDIUM | [box-office 39](box-office.md) | Payments' contributions to Front of house contradict its own `uses` | part 4's own rule. Add `front-of-house` to Payments' `uses`. (FND/02-formats.md:165 front-of-house is a reserved id.) |
| W-155 | MEDIUM | [core 13](core.md) | Box office says its audience messages go "through the communications service"; core's service is `notify` | core (the pipeline owner). Fix: box office names `notify`, declares its types (order confirmed, cancelled, rescheduled, refund sent, waiting-list offer, payment did not complete) and drops "communications service". The suppression sentence needs one rule: core … |
| W-156 | MEDIUM | [core 14](core.md) | "Moved" means different things; box office does not listen to core's `moved` or `capacity-changed`; the capacity contract is vague | see finding |
| W-157 | MEDIUM | [interface 22](interface.md) | Journey 1 and W3: step numbering, where the hold starts, and where "pay" lives | box office (it owns the rules), with the interface adapting: the hold starts when the claim batch runs (BO 06:35 "Pressing the button runs the claim batch") or at Basket (BO 06:148); decide which and make the mermaid, text, W3 and image agree. Owner: IF 05-3,  … |
| W-158 | MEDIUM | [interface 25](interface.md) | Door result bands and sound against settings | settings and journeys over the wireframe prose. Decide whether sound is on by default (box office says one sound per scan) and align `core.live.result-sound` default; remove or explain "Let in anyway". Owner: IF 06, 05-4, W5 image; BO 06:88. |
| W-159 | LOW | [box-office 40](box-office.md) | Order diagram caption and states | see finding |
| W-160 | LOW | [box-office 41](box-office.md) | Webhook table kind | see finding |
| W-161 | LOW | [box-office 42](box-office.md) | Account columns' class is Internal for subjects, Personal for actors | see finding |
| W-162 | LOW | [box-office 43](box-office.md) | Door timing settings overlap core | core; read `doors_at` through the performance service. Owner: BO 03, 07. |
| W-163 | LOW | [box-office 44](box-office.md) | Reasons: fixed list vs vocabulary | Interface and the line at 03:103; declare the vocabularies in part 6 and make `reason_code` a `reason_term_id`. Owner: BO 03, 07. |
| W-164 | LOW | [box-office 45](box-office.md) | Export ability | see finding |
| W-165 | LOW | [box-office 46](box-office.md) | Navigation groups | see finding |
| W-166 | LOW | [box-office 47](box-office.md) | Preset differences equal the defaults | see finding |
| W-167 | LOW | [box-office 48](box-office.md) | Missing tests for features moved into the first release | see finding |
| W-168 | LOW | [box-office 53](box-office.md) | Scan id shape | see finding |

## Form builder (25 items)

| # | Severity | Finding | What to fix | Settle by |
| --- | --- | --- | --- | --- |
| W-169 | HIGH | [forms 2](forms.md) | "Group" as an audience, a reviewer set and a transition actor is not defined anywhere. | identity owns who people are grouped as. Suggest forms replaces "group" with "holders of a role" (`holdersOfRole`, identity 05:100) or a role/fact reference stored as the `core.requirement` style reference `<source>:<id>` (foundations 02-formats), and drops `a … |
| W-170 | HIGH | [forms 3](forms.md) | Foundations' per-form webhook opt-in is not something the manifest can express. | foundations. Either forms declares a second, non-internal event for opted-in forms (for example a separate `forms.response.shared` event with ids only) and the opt-in is a form setting that decides whether it is announced, or foundations rules on a conditional … |
| W-171 | HIGH | [forms 4](forms.md) | What a simple form's response ends in: "stops at Pending" against "default stage is `closed`". | the table and rule text (04:102, 04:127). Fix the diagram note to "A form with no workflow stops at Received (closed)" and add a direct submit -> stage edge. |
| W-172 | HIGH | [forms 5](forms.md) | Review summary: who sees the scores after release. | unclear, needs Matt. The tab 3 rule and the FB-405 criterion say the whole panel; the screen and ability tables say chair/decider. Either `forms.review.score` gains "see the summary after release" and screen 13 admits reviewers, or tab 3 and FB-405 say "chair" … |
| W-173 | HIGH | [forms 6](forms.md) | The first release has no way to place the templates it ships. | the stories list (it is the build order). Suggest the template table is split into "first release (on `forms.link`)" (Access requirements, Feedback survey) and "arrive with their slot", and the roadmap line is corrected, or FB-501/FB-502/FB-503 move to the fir … |
| W-174 | HIGH | [forms 8](forms.md) | The slots forms "expects" are not declared by the workstreams said to own them. | forms 05:40 states it is "expected"; the claim "each owned by its module's workstream" is therefore a request. Core domain and identity should acknowledge `core.*-fields` (or forms should own them as `forms.production-fields`), and the slot format needs a `sid … |
| W-175 | MEDIUM | [box-office 21](box-office.md) | Forms slot for checkout questions has two different names and shapes | Forms owns `forms.slot`; Box office contributes one slot. Rename to `box-office.checkout-questions`, attach to ticket type (as Forms says) or document the production scope, and list it as a contribution to `forms.slot`. Also note FORMS asks BO for a charge ser … |
| W-176 | MEDIUM | [core 16](core.md) | Forms expects core to declare form slots, which core never mentions, and core cannot contribute to forms' point | see finding |
| W-177 | MEDIUM | [forms 9](forms.md) | Payments: forms still waits on an interface Payments has already designed differently. | box office/payments (it is the owning module and has since answered). Suggest forms rewrites the row and the "Open" line to "forms contributes a settlement handler for owner `forms.response`", and stays out of the first release as already decided. |
| W-178 | MEDIUM | [forms 10](forms.md) | Facts forms reads for "who is answering" are not declared by their owners. | identity and foundations. Suggest forms 05:137 lists only `core.member`, `membership.*` facts and anything declared by `core.requirement` sources, and drops "signed in" (a respondent-kind switch handled by audience) and "age band" until someone declares one. |
| W-179 | MEDIUM | [forms 11](forms.md) | Merge handling: forms says merge "moves" every person column, but append-only tables must use `alias`. | foundations and identity. Forms should state `alias` for append-only actor columns and `move` for the rest; reads then follow `merged_into_id`. It should also say how `unique (placement_id, person_id)` participation and `unique (response_id, round, reviewer_id … |
| W-180 | MEDIUM | [forms 12](forms.md) | Table options required by the registry are not declared: realm, subject, retention, append-only, erase behaviour. | foundations format. Add a line per table (realm, subject, retention setting, append-only) and rename forms' columns or note the collision. |
| W-181 | MEDIUM | [forms 13](forms.md) | Foundations' later email-subject rulings change what forms relied on. | foundations (later ruling). Forms may keep its constraint as its own rule (it is stricter and allowed), but should say it is a forms rule, and must declare `unlinked: 'staff'` on `forms_responses` (or argue why an anonymous response, which holds only classed a … |
| W-182 | MEDIUM | [forms 14](forms.md) | Prefixes are registered for tables that have no id column, and the drafts' resume token is on the wrong table. | foundations' rule. Either give those tables an id column or drop the four prefixes from forms 03:354-361 and foundations 06:94 (freeing `fans`, `fopt`, `fpar`, `fdr`); correct the drafts line to point at the responses table. The id table also says 16 prefixes  … |
| W-183 | MEDIUM | [forms 15](forms.md) | Interface rule on special-category drafts on the device against forms' draft behaviour. | interface's device rule is a safety rule; forms should state that a signed-out draft on a form with a special-category question is not kept on the device (or at all), and which retention (7 days, or `forms.drafts.keep-for`) applies to device drafts. |
| W-184 | MEDIUM | [forms 16](forms.md) | A signed-out respondent cannot be the "submitter" for revise-when-returned. | unclear, needs the forms author (and identity). Suggest a returned response issues a fresh token link by email, or `edit_after_submit = when_returned` is refused for placements open to signed-out respondents. |
| W-185 | MEDIUM | [forms 18](forms.md) | Public address of a form is unspecified and may collide with a theatre page. | foundations/interface. Forms should state the address (for example inside an existing shell, or add `/forms` to the reserved list), and the confirmation/"My response" addresses. |
| W-186 | MEDIUM | [forms 19](forms.md) | Embedded form and the custom-fields panel: the contribution points do not match what the specification describes. | the interface specification and core for the shape. Forms should add `core.public-component` to its contributions and say which of tab, section or component custom fields use. |
| W-187 | LOW | [forms 20](forms.md) | A foundations question is shown as still being asked. | forms 05:155. Delete the stale clause in 03:204. |
| W-188 | LOW | [forms 21](forms.md) | Question type list differs from the paper's. | the paper (a requirement) unless a decision says otherwise; none does. Add "signature" to the "later" list or record its removal; align "sections". |
| W-189 | LOW | [forms 22](forms.md) | Shell wording. | see finding |
| W-190 | LOW | [forms 23](forms.md) | The client-made id and the example ids break the id rules. | see finding |
| W-191 | LOW | [forms 24](forms.md) | Receipts for signed-out respondents need core's address-based send. | see finding |
| W-192 | LOW | [forms 25](forms.md) | Withdrawal diagram against the guard. | text. Add `review -->\|withdraw\| withdrawn`. |
| W-193 | LOW | [forms 26](forms.md) | Status and counts wording. | see finding |

## Interface and wireframes (32 items)

| # | Severity | Finding | What to fix | Settle by |
| --- | --- | --- | --- | --- |
| W-194 | HIGH | [box-office 4](box-office.md) | Interface and box office disagree on the door's shell, route and navigation entry | Interface (owner of shells), plus the Foundations rule that a navigation entry's `to` sits under its shell's prefix. Door and door list become `/live/box-office/...` (or `/live/door/<performance>`), contributed with `shell: 'live'`; the sheet heading changes.  … |
| W-195 | HIGH | [box-office 5](box-office.md) | Ability name and nav count in Interface's contract example | Box office owns its ability names. Interface example to use `box-office.order.view` and a Payments count (`payments.refunds-awaiting`). Box office should also declare the count it registers (Interface 05-1:109 "Counts are opt-in"). |
| W-196 | HIGH | [core 3](core.md) | Credit-line setting declared twice | unclear. Core's file also says (`ui/06-settings-and-abilities.md:29`) "Brand colour, logo, fonts and name are workstream 3's settings; they are not repeated here", which suggests the brand side owns it. Pick one key, delete the other, and name which ability ch … |
| W-197 | HIGH | [foundations 2](foundations.md) | Members' area name and switch declared twice | identity (2). It owns the members' area rule and the `core.member` fact, and its settings carry the preset defaults (`F:` presets in identity 07 lines ~83-88) that the interface text repeats ("off for a small venue"). |
| W-198 | HIGH | [foundations 4](foundations.md) | Audit-read ability has two names; `core.setting.change` is declared by two owners | foundations for `core.audit.view`/`core.setting.change` (it owns the Audit and Settings screens and the `core_audit` table); interface adopts them. Interface's "Activity" list is the same audit trail; the screen should be one screen. |
| W-199 | HIGH | [foundations 5](foundations.md) | Interface listens for an event foundations does not announce | foundations (declares the events). **Fix:** interface listens to `core.module.enabled` and `core.module.disabled`. Note also the ruling that these two are `internal: true` (`F:02-formats.md:156`) while the events table in foundations 06 does not say so; add an … |
| W-200 | HIGH | [foundations 9](foundations.md) | Interface layer's three tables have no prefix, no heading line and are not in the index or the backlog count | foundations' format. **Fix:** interface rewrites part 2 in the layout, picks a prefix for `core_saved_views` (e.g. `svw`), and foundations adds an Interface row to the prefix index and the backlog count becomes 112. `core_preferences` keyed by (`account_id`, ` … |
| W-201 | HIGH | [identity 3](identity.md) | Members' area switch and name declared twice (identity and interface) | identity. Foundations says workstream 2 owns this area, and identity 04 and ID-20 depend on the identity keys. |
| W-202 | HIGH | [interface 1](interface.md) | Members' area setting: two keys, two limits | identity. It owns the members' area standing and has the presets. Drop the two IF keys and have IF 06 point to identity's; fix the 30/40 split. Also fix the preset wording at IF 06:13 ("on for student society and amateur company, off for a small venue"), which … |
| W-203 | HIGH | [interface 2](interface.md) | Credit line: `core.shells.credit-line` against `core.brand.credit-line` | core (IF 06:28 itself says "Brand colour, logo, fonts and name are workstream 3's settings"). Remove the IF key. Owner: IF 06. |
| W-204 | HIGH | [interface 4](interface.md) | Ability names differ from foundations' | foundations. Remove `core.setting.change` from IF's list (say "uses foundations'"), rename to `core.audit.view` and say the Activity list is foundations' Audit screen. Recount IF's abilities (then 3, or 4 with `core.audit.view` removed too: `core.navigation.ar … |
| W-205 | HIGH | [interface 6](interface.md) | The desk: console in the journeys, "a Live page" in W4 | 05-1 ruling, journey 3 and box office (console, laptop-first). Amend W4's text and image title ("live mode, no sidebar") to "Console desk, sidebar collapsed" (or define a console "full-width desk" variant), drop the 44 px caption, and decide whether "Sell at t … |
| W-206 | HIGH | [interface 7](interface.md) | Desk designed phone-first or laptop-first | the paper's Part B convention. Amend BO 06:7 to "checkout and the door are phone first; the desk is laptop first with a tablet layout". Owner: BO 06. |
| W-207 | MEDIUM | [box-office 20](box-office.md) | Contributions that Interface, Foundations and Core expect from Box office are absent | Interface and Foundations lists. Add the missing contributions to BO's table (or say they are later), and align "price list" wording. |
| W-208 | MEDIUM | [box-office 23](box-office.md) | Public routes outside the reserved prefixes, and a route shape that differs from Interface | Foundations rule. Move to `/book/order/<token>` and `/book/passes` (or `/account/...` for signed-in), and settle with Interface the performance segment of `/book`. |
| W-209 | MEDIUM | [box-office 30](box-office.md) | Offline door manifest, names and flags differ from Interface | BO for privacy (names off by default), but then "find by name" is online-only by default and Interface should say so; BO must add the reconnect flag for tickets voided after download, and state whether codes or hashes are on the device. |
| W-210 | MEDIUM | [box-office 31](box-office.md) | Complimentary tickets at the desk | BO (decided rule). Interface to change journey 3: complimentary is "pick an approved request", with "Request approval" always offered. |
| W-211 | MEDIUM | [foundations 28](foundations.md) | Interface write queue outlives the idempotency window | see finding |
| W-212 | MEDIUM | [interface 11](interface.md) | Event name: `core.module.switched` does not exist | foundations. Owner: IF 04. |
| W-213 | MEDIUM | [interface 13](interface.md) | Preferences stored twice: language | identity's column (the account screen edits it, and notifications need it); IF drops `language` from `core_preferences`. Also 02:20 lists key `live-dark` and 06:81 "sound on this device" which is neither in the key list nor `core_preferences`; and the key `liv … |
| W-214 | MEDIUM | [interface 14](interface.md) | Inbox: one entry in the menu, two inboxes in core | core's two inboxes (a decision of core and identity). IF should list the audience inbox under My account and the member inbox in the members' area and say the menu opens the one for the current shell. Owner: IF 05-1, 05-screens. |
| W-215 | MEDIUM | [interface 17](interface.md) | Navigation `ability` field: required, omitted, or a fact-like condition | foundations says required; resolve with a rule: an `account` entry names the route declaration `signed-in` (or a `core.signed-in` ability), and "has a draft" entries use a `count` of zero to hide. Owner: IF 04, ID 06, FB 05. |
| W-216 | MEDIUM | [interface 18](interface.md) | Public header: shapes differ | interface (it owns the shells). Redraw ID's image to the account menu; align the labels ("What's on" is the interface and core's name, `/whats-on`). Owner: ID 06 (image and text). |
| W-217 | MEDIUM | [interface 19](interface.md) | W7 audience menu: entries in the image differ from the text | the text (05-1 table). Redraw W7 frames 1 and 2. Also the W7 frame 4 caption "The bar shows only while your shift is running" against 03:171-ish where the window opens 30 minutes before call time and closes 60 minutes after the shift ends (see 21). Owner: IF i … |
| W-218 | MEDIUM | [interface 21](interface.md) | On-shift window: "from the shift's start" against the window rule | 03 (the stated assumption, which agrees with identity's "a confirmed shift in its window", ID 05:176). Amend journey 8 and the W7 caption to "from when the window opens". Owner: IF 05-3, W7. |
| W-219 | MEDIUM | [interface 23](interface.md) | Statuses in the images are not box office's states | box office's states. IF 05-4:61 already says the three W8 settings are examples; add the same caveat for W2 and W6 or redraw. Owner: IF images W2, W6 and 05-3 journey 5. |
| W-220 | MEDIUM | [interface 24](interface.md) | Refund self-approval rule | box office. Reword the journey row. Owner: IF 05-3. |
| W-221 | MEDIUM | [interface 26](interface.md) | Phone-width breakpoints: 640 against 1024 | unclear; the interface should name one breakpoint set (phone, tablet, laptop) and state which applies to cards and to the bottom bar. Owner: IF 05-2. |
| W-222 | MEDIUM | [interface 27](interface.md) | Settings page copy: "who may change it" against "who last changed it" | foundations' list as the minimum. Owner: IF 05-2. |
| W-223 | MEDIUM | [interface 28](interface.md) | Where "My forms" and the review queue sit: recorded as agreed but not written | see finding |
| W-224 | LOW | [box-office 52](box-office.md) | Interface journeys show a donation or programme extra at the basket | see finding |
| W-225 | LOW | [interface 30](interface.md) | Stale status wording | see finding |

## Design paper (40 items)

| # | Severity | Finding | What to fix | Settle by |
| --- | --- | --- | --- | --- |
| W-226 | HIGH | [paper 1](paper.md) | Proof results in Part B are out of date. | the specs and the status tab (D4 is a Matt decision). Fix: rewrite the table to four releases, Linux only (no matrix), last seat passed on deployed D1, deploy passed with the finding that the button's copy starts a fresh history (F-35). Note the proof releases … |
| W-227 | HIGH | [paper 2](paper.md) | Next-stage tab says nothing has started and lists a retired proof. | tabs 11 and 12. Fix: mark the stage as done, the proof as Linux-only, and record the second round (or mark the tab as historical). |
| W-228 | HIGH | [paper 6](paper.md) | Payments' dependency is wrong and contradicts Part B. | Foundations and BO. Fix the catalogue "Needs" column: Payments needs Finance; Box office needs Payments and Finance (Core is not enough); Bar needs Payments and Finance; Membership needs the form builder (`membership` requires `forms`) and its fees part needs  … |
| W-229 | HIGH | [paper 22](paper.md) | Backlog headline numbers are not current. | see finding |
| W-230 | MEDIUM | [box-office 10](box-office.md) | Overview and proof statuses are out of date | the deployed result. Update overview lines 10 and 77, proof line 7 and the first limitations row. Also PAPER/11:9 still says "D5 sits beside B1 as something only you can do: together they unblock the two remaining proofs" while B1 is answered and the proof is  … |
| W-231 | MEDIUM | [box-office 13](box-office.md) | Withdrawn `box-office.eligibility` point and old consent column still appear as live | Foundations, then BO's own later correction. Rewrite or delete the superseded text rather than leaving it above its correction; update scope, screens, stories, cut list, the data-model column list and the paper's backlog line. Move the consent and `prepare/par … |
| W-232 | MEDIUM | [box-office 25](box-office.md) | Design paper catalogue contradicts the dependency rule BO relies on | Foundations and BO. Catalogue "Needs": Box office: Payments, Finance; Payments: Finance; and keep "Finance: Core" only if core counts as a dependency. The catalogue also lists "Reports" etc., unaffected. |
| W-233 | MEDIUM | [foundations 25](foundations.md) | Part B (paper) contradicts the foundations rulings it says win | foundations (the paper states "where the two differ it wins"). **Fix:** update the repository table, the proofs table and the draft reference. |
| W-234 | MEDIUM | [foundations 26](foundations.md) | Pull-request previews: on or off | foundations (it names the reason and the engineering tab is the older text). **Fix:** paper changes to "off by default". |
| W-235 | MEDIUM | [foundations 27](foundations.md) | "Any platform" tests in the paper | see finding |
| W-236 | MEDIUM | [identity 31](identity.md) | Guest checkout wording in Part A | the decision. |
| W-237 | MEDIUM | [paper 3](paper.md) | Tab 11 and tab 12 contradict each other about the second round. | tab 12 (newer). Also paper/11:3 "As of 16 November" has no second-round status and says "Every question on this tab is now answered, and nothing here waits on you" while tab 12 refers to open questions X1 and X4. |
| W-238 | MEDIUM | [paper 4](paper.md) | Reference to a tab that does not exist. | see finding |
| W-239 | MEDIUM | [paper 5](paper.md) | Overview tab index is incomplete. | see finding |
| W-240 | MEDIUM | [paper 7](paper.md) | "Sixteen modules" no longer matches the module list. | see finding |
| W-241 | MEDIUM | [paper 8](paper.md) | The form builder is "part of the core" in the paper but a separate module in the specs. | Foundations ruling (a separate always-on module). Suggested wording: "an always-on module, `forms`, beside core". Fix "bookings" to production, person and venue first. Owner: paper 04-3, 04-part-a. |
| W-242 | MEDIUM | [paper 9](paper.md) | What the form builder delivers in phase 4 is narrower than the paper says it does. | see finding |
| W-243 | MEDIUM | [paper 10](paper.md) | One queue / one cron. | Foundations (explicit). Fix paper wording to "one cron trigger; two job lanes, each with a dead-letter queue, and one email-outcome queue". Owner: paper 05-part-b. |
| W-244 | MEDIUM | [paper 11](paper.md) | KV used for sessions. | Foundations and Identity (sessions are D1 rows). Fix the table: "Cache (rebuildable data only)". Owner: paper 05-part-b. |
| W-245 | MEDIUM | [paper 12](paper.md) | `site/` described as a Nuxt layer; deploy configuration in the wrong file. | Foundations 12-1 and the proof. Also F 12-1 says "no hand-kept Wrangler file" nowhere, but the paper says (line 24) "no hand-kept Wrangler file" while F lists a committed theatre `wrangler.jsonc`; one of them should say what is generated and what is committed  … |
| W-246 | MEDIUM | [paper 14](paper.md) | Previews, upgrade tests and module-isolation tests differ from Foundations. | Foundations (owning spec and later). Owner: paper 05-3 (and 03-lessons-from-mailflare:39 "Preview deployments with their own resources" is Mailflare's practice, which is fine). |
| W-247 | MEDIUM | [paper 15](paper.md) | Tests "on any platform" versus D4. | D4. Fix: "on Linux, locally and in CI, without an account". Owner: paper 05-3, 02. |
| W-248 | MEDIUM | [paper 19](paper.md) | Sign-in methods offered. | Matt's decision and Identity. Fix: first implementations are passkey, emailed link and code, Google; password and Microsoft later; drop "password reset" from the Turnstile list until passwords exist. Owner: paper 05-1, 05-2. |
| W-249 | MEDIUM | [paper 23](paper.md) | Stories missing from or mis-placed in the order of work. | see finding |
| W-250 | MEDIUM | [paper 24](paper.md) | Roadmap and backlog disagree on the Bar's move into phase 3. | the roadmap (later timestamp, states Matt's decision); update tab 12. Fix "next phase" to phase 5. Owner: paper 07, 12. |
| W-251 | MEDIUM | [paper 25](paper.md) | Phase 1 lists accounts with the members' experience; the backlog puts it in phase 2. | the backlog (it is dependency-checked). Fix roadmap phase 1 wording. Owner: paper 07. |
| W-252 | MEDIUM | [paper 26](paper.md) | Roadmap leaves most of Finance unscheduled. | see finding |
| W-253 | MEDIUM | [paper 30](paper.md) | Paper commitments that no specification delivers. | see finding |
| W-254 | LOW | [box-office 51](box-office.md) | Roadmap lists "customer records" for phase 3 | BO. Reword roadmap ("order history on the account"). Owner: PAPER 07. |
| W-255 | LOW | [interface 29](interface.md) | Story and screen counts stale in the scope tab and the paper | tab 7 (36). Fix IF 01:51 and the backlog table. (Checked and agreeing: 31 screens at 05-screens:3, 26 test cases at 08:3, nine questions, 20 settings, 5 abilities.) Owner: IF 01, paper 12. |
| W-256 | LOW | [paper 13](paper.md) | Repository table puts migrations and starter content in the wrong places. | Foundations. Owner: paper 05-part-b. |
| W-257 | LOW | [paper 17](paper.md) | Heading and coverage of the "Amended by the foundations specification" section. | see finding |
| W-258 | LOW | [paper 18](paper.md) | Test and command list differs. | F. Owner: paper 05-3. |
| W-259 | LOW | [paper 20](paper.md) | "Shadow accounts" and self-merge. | see finding |
| W-260 | LOW | [paper 21](paper.md) | Preset names differ between Foundations and the paper/Identity. | Identity (owns presets). Owner: F 07-screens (not the paper). Counts of preset roles agree (14 + welfare-lead = 15, paper/12:146). |
| W-261 | LOW | [paper 27](paper.md) | Roadmap phase 0 and tab 12 intro. | tab 12's second-round section. Owner: paper 07, 12. |
| W-262 | LOW | [paper 28](paper.md) | Bounce reporting is called unverified in the paper but ruled in Foundations. | see finding |
| W-263 | LOW | [paper 29](paper.md) | Paper research tab still lists a finished check. | see finding |
| W-264 | LOW | [paper 31](paper.md) | Glossary rulings not applied in the specs they bind. | see finding |
| W-265 | LOW | [paper 32](paper.md) | Payment methods named differently. | BO and B2. Owner: paper 04-2, 05-1, 09-3. |
