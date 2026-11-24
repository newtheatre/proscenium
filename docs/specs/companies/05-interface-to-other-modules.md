# 4. Interface

Companies requires only Finance and Payments, and reaches every other module through events and points, so a theatre can run it with Box office, Spaces, Invoices or Festival switched off. Under Foundations' rule M3 it calls no service of a module it only uses; where it needs something from one, that module contributes to a Companies point.

## The module

| Field | Value |
| --- | --- |
| `id` | `companies` |
| `switchable` | true; off by default in `student-society`, on in `small-venue` and `amateur-company` (part 9, Q1) |
| `requires` | `finance`, `payments` |
| `uses` | `box-office`, `spaces`, `invoicing`, `programme-planning`, `festival`, `communications`, `budgets`, `productions`, `forms`, `reports` |
| Tables | 13 (part 2) |
| Record types | `companies.company`, `companies.contact`, `companies.engagement`, `companies.agreement`, `companies.allocation`, `companies.settlement` |
| Facts | `companies.contact-of` |
| Topics | `companies.dealings` (transactional, not optional) |

## Fact

**`companies.contact-of`**, record-scoped. True for an account that is a live contact (no `ended_at`) of: the company itself (scope `companies.company`); the company of a live engagement (scope `companies.engagement`); the company of the live engagement on a production (scope `core.production`, and so its performances). Recomputed in the batch that adds or ends a contact or links an engagement.

Defaults offered to the theatre (Identity's fact mapping), replacing the `visiting-company` grant that Box office's part 6 names: on a production, `box-office.report.view` and `finance.ledger.view`; on an engagement, `companies.engagement.view-own`, `companies.guest.name`, `companies.people.manage-own`, `companies.agreement.answer`, `companies.settlement.answer`. Productions maps `productions.task.view` and its show-report view to the same fact (agreed with spec 4).

## Services

For modules that list `companies` in `requires`. None of this round's specs does yet; each has agreed a point route instead.

| Service | Shape | Notes |
| --- | --- | --- |
| `findOrCreate(unit, { name })` | company id | G1's matching |
| `contactsOf(companyId)` | `[{ accountId, name, role, receives }]` | Live contacts only |
| `engagementFor(productionId)` | `{ engagementId, companyId, kind, state } \| null` |  |
| `billingDetails(companyId)` | `{ name, addressLines, postcode, country, invoiceEmail, taxNumber }` | Also returned inside the `invoicing.line-owner` contribution |
| `isContactOf(accountId, scope)` | boolean | The fact, as a call |

## Services Companies uses

| Module | Service | For |
| --- | --- | --- |
| Finance | `postEntries`, `reversePosting`, `ensureSystemAccounts` | M1, M4, S10 |
| Finance | `productionStatement(productionId)` | S2's figures |
| Payments | intent creation and refunds | M2, M3 |
| Core | `findOrCreateAccount` (guest rule), notify, files | G2, L2, riders |
| Core | `setProductionCompanyName(unit, productionId, name)` | G3. New: asked of Festival-ready changes (C-68) |

## Points Companies declares

| Point | Kind | Contract | Contributors agreed |
| --- | --- | --- | --- |
| `companies.engagement-panel` | code | `{ id, label, order, appliesTo(engagement), component }`; shown on the contact's engagement page and the staff engagement page | Festival ("Festival information"), Productions (tasks, show reports) |
| `companies.guest-issuer` | code | `{ hold(unit, performanceId, places, label) -> holdRef, issue(unit, holdRef, accountId, places) -> orderRef, withdraw(unit, orderRef), release(unit, holdRef, places) }` | Box office (new contribution, BO-75) |
| `companies.hire-source` | code | `{ bookingsFor(engagementId) -> [{ bookingId, spaceId, startsAt, endsAt, state }] }`; also says whether a booking may be linked | Spaces (amendment; part 9, Q4) |
| `companies.settlement-note` | code | `{ id, lines(engagement) -> [{ label, amountMinor, currency, link }] }`; read only, never posted | Budgets (awards) |
| `companies.settlement-charge` | code | `{ key, lines(engagement) -> [{ key, label, amountMinor, currency, sourceRef }], entries(unit, line) }`; the contributor posts the income side on its own accounts | Inventory (kit hire, later) |

With no contributor to `companies.guest-issuer`, guest places are recorded and named but issued by hand at the box office, and the screen says so. With none to `companies.hire-source`, a hire is confirmed on its calls alone (E3).

## Contributions

| Point | Owner | What Companies contributes |
| --- | --- | --- |
| `core.navigation` | Core | Console: Companies, with Engagements and Settlements under it. Account menu: Companies, shown only when the fact holds |
| `core.account-section` | Core | "Your companies" on My account, for contacts |
| `core.record-tab` | Core | A Company tab on `core.production`; Engagements and Contacts tabs on `companies.company` |
| `core.record-fact` | Core | On `core.production`: the company and the engagement's state (shown on Programme planning's tray card) |
| `core.record-resolver` | Core | All six record types: name, link, archived flag |
| `core.search-source` | Core | Companies and contacts by name |
| `core.home-card` | Core | "Waiting on companies": agreements unanswered, guest names due within 48 hours, settlements to prepare, approve or chase |
| `core.erasure-handler` | Core | G7 for private hirers; ends contacts of an erased account |
| `core.measure` | Core (Reports, spec 12) | `companies.settlements-due` and `companies.settlements-paid` (money, by production and engagement kind), `companies.guest-tickets` (count) |
| `finance.system-account` | Finance | The seven accounts in part 2 |
| `payments.settlement` | Payments | Deposits and payments in from companies (M2, M4) |
| `forms.field-type` | Forms | A company picker, for calls and hire enquiry forms |
| `forms.outcome-action` | Forms | "Open a hire enquiry": makes a company (or finds it) and an `enquiry` engagement of kind `hire` from the answers |
| `communications.audience-source` | Communications | `companies.contacts`, filtered by season, collection, day, space, engagement kind and state, and what contacts are set to receive |
| `programme-planning.entry-contacts` | Programme planning | Given an entry and company, the contacts set to receive `schedule` |
| `programme-planning.entry-source` | Programme planning | For a season: engagements with no production yet, for the tray's "From Companies" group |
| `festival.sheet-section` | Festival | `companies.calls`: a space's get-ins, get-outs and calls for an operating day, with each company's day-of contact (phone only with `companies.contact.view-details`) |
| `invoicing.line-owner` | Invoicing | For a settlement: counterparty, direction and lines (`lines`); at issue and credit, the Companies half of the posting (`entries`). Billing details and the company picker go through `invoicing.counterparty` |

## Events Companies announces

Ids only, internal false unless said.

| Event | Payload | When |
| --- | --- | --- |
| `companies.company.merged` | `{ survivorId, mergedId }` | G5 |
| `companies.company.archived` | `{ companyId }` | G6 |
| `companies.contact.changed` | `{ companyId, contactId }` | Added or ended (internal) |
| `companies.engagement.changed` | `{ engagementId, from, to }` | Every engagement move |
| `companies.engagement.agreed` | `{ engagementId, companyId, seasonId }` | A3, so a tray may offer it |
| `companies.call.changed` | `{ engagementId, callId }` | D4 |
| `companies.settlement.approved` | `{ settlementId, engagementId }` | S7; Invoicing raises its draft on this |
| `companies.settlement.paid` | `{ settlementId, engagementId }` | S9 |

Also `companies.settlement.withdrawn` `{ settlementId }`, when an approved settlement not yet issued as an invoice is superseded (S10); Invoicing deletes its draft.

## Events Companies hears

| Event | From | Does |
| --- | --- | --- |
| `programme-planning.entry.accepted` | Programme planning | E2 |
| `core.performance.scheduled` | Core | Adds an allocation where an accepted agreement gives guest places |
| `core.performance.changed` | Core | Moves `names_due_at` with the start |
| `core.performance.cancelled` | Core | Releases its allocation; Box office cancels guest tickets as for any order |
| `core.production.changed` | Core | Re-reads the title shown on an engagement that has not set its own |
| `invoicing.invoice.paid` | Invoicing | S9 |
| `invoicing.invoice.credited` | Invoicing | Reopens the settlement for a new version (S10) |
| `payments.refund.completed` | Payments | M3: deposit `returned` |

## Notification types

All on topic `companies.dealings`, email plus inbox.

| Type | To | When |
| --- | --- | --- |
| `companies.contact-added` | The new contact | G2: who added them, for which company, a claim link |
| `companies.agreement-sent` | Contacts receiving `agreement` | A2 |
| `companies.agreement-answered` | The engagement's venue contact | A3 |
| `companies.guest-names-due` | Contacts receiving `guests` | `companies.guests.remind-before` before the deadline, when places are unnamed |
| `companies.schedule-changed` | Contacts receiving `schedule` | D4 |
| `companies.settlement-proposed` | Contacts receiving `settlement` | S5 |
| `companies.settlement-queried` | The preparer | S6 |
| `companies.settlement-approved` | Contacts receiving `settlement` | S7, with the balance and what happens next |

Slot notices on publishing a season are Programme planning's, not these.

## Routes

| Route | Ability | Rule |
| --- | --- | --- |
| `GET/POST /api/companies` | `company.view` / `company.manage` | G1 |
| `POST /api/companies/<id>/merge` | `company.merge` | G5 |
| `POST /api/companies/<id>/contacts` | `contact.manage` | G2, G4 |
| `GET/POST /api/companies/engagements` | `engagement.view` / `engagement.manage` | E1 to E6 |
| `POST /api/companies/engagements/<id>/agreements` | `agreement.manage` | A1, A2, A6 |
| `POST /api/companies/agreements/<id>/answer` | `agreement.answer` (fact) or `agreement.record` | A3 |
| `POST /api/companies/allocations/<id>/guests` | `guest.name` (fact) or `allocation.manage` | L2, L3 |
| `POST /api/companies/engagements/<id>/settlements` | `settlement.prepare` | S1, S2 |
| `POST /api/companies/settlements/<id>/answer` | `settlement.answer` (fact) | S5, S6 |
| `POST /api/companies/settlements/<id>/approve` | `settlement.approve` | S7, S8 |
| `POST /api/companies/settlements/<id>/payments` | `settlement.record-payment` | M4 |
| `GET /api/account/companies` | signed in; the fact | The contact's view |

## Jobs and tasks

- **Every 15 minutes:** close allocations past `names_due_at` (L5).
- **Daily, 06:00 in the theatre's time zone:** complete engagements (E4), send guest-name reminders, flag settlements past `settle_within`.
- **Weekly:** remove contact links and company people past their retention.

## Agreed with other specs (23 November 2026)

| With | Agreed |
| --- | --- |
| Programme planning (1) | Entry is theirs, engagement mine. They announce `programme-planning.entry.accepted`; I open the engagement. They tell acts their slots; I contribute contacts to `entry-contacts` and waiting engagements to `entry-source`, and send no slot notices |
| Festival (2) | No performer view in Festival: FE-08 becomes CO-20. Festival contributes "Festival information" to `companies.engagement-panel`; I contribute `companies.calls` to `festival.sheet-section`. "Act" is Festival's public word |
| Productions (4) | Rights holders are theirs, not companies. A visiting show's licence is the company's; their state "Held by the visiting company" matches my agreement clause. My fact can hold their task and show-report view |
| Budgets and claims (8) | Awards are theirs, shown on a settlement as notes through `companies.settlement-note`, never posted or netted. No bank details in Companies |
| Invoices and exports (9) | Module `invoicing`, which uses companies. I own billing details, given through `invoicing.counterparty`; Invoicing listens for `companies.settlement.approved` and reads lines through `invoicing.line-owner`; posting once, at issue. A superseded settlement announces `companies.settlement.withdrawn`. Deposits stay in Payments; an invoice shows one as a note only |
| Fundraising (10) | A company has no fixed kind; Sponsorships hang off it through `core.record-tab`, referencing `companies.company` |
| Inventory (11) | A loan may name a company by reference; kit hire fees later through `companies.settlement-charge` |
| Reports (12) | Three measures through `core.measure`; box office figures for contacts read through core's `readMeasure` |

### Still open

| With | Need | Proposed |
| --- | --- | --- |
| Box office (built) | Contribute to `companies.guest-issuer` | BO-75, through the Integration thread |
| Spaces (spec, unbuilt) | Contribute to `companies.hire-source`; treat calls as blockers | Part 9, Q4 |
| Core | `setProductionCompanyName` service | C-68, asked of Festival-ready changes |
| Foundations | Register the 13 prefixes and CO as a story prefix | Integration thread |

### Amendments to other specs

Replacing the `visiting-company` grant with the fact `companies.contact-of` touches three existing specs. The `visiting-company` preset is **kept**, so the preset count stays fixed (R-03), but it is redefined: it is the role whose abilities the fact's defaults hold, and the module grants it to nobody. A theatre may still grant it by hand for a company that needs console access, scoped to one production.

| Spec | Where | Change |
| --- | --- | --- |
| Identity | Part 6, the preset table (identity 07, line 217) | `visiting-company`: "granted by Companies' fact `companies.contact-of`; not granted by default" |
| Box office | Part 6, holders of `box-office.comp.request`, `box-office.report.view`, `finance.ledger.view` | "`visiting-company` by grant" becomes "fact `companies.contact-of` on the production". Guest places replace comp requests for companies; `comp.request` stays for production leads |
| Bar | Part 6, holders of `bar.report.view` | "`visiting-company` by grant" becomes "fact `companies.contact-of` on the production", where the theatre maps it |
