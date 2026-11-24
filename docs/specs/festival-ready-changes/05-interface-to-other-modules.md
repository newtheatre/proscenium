# 4. Interface to other modules

Every service that writes adds statements to the caller's unit of work and never commits; every read takes ids set-wise and binds at most 90 parameters per statement. Names below were agreed with the specs that call them on 23 November 2026.

## Core services (new)

| Service | Kind | Used by | Notes |
| --- | --- | --- | --- |
| `listCollections({ seasonId?, state? })` | read | Festival, Programme planning, public site | Ordered by `sort` |
| `collectionsFor(productionIds)` | read | Festival, Box office (measures), public site | Map of production id to `{ id, slug, name, colour }[]` |
| `lineUpsFor(performanceIds, { publicOnly? })` | read | Festival (timetable, venue-day sheet), public site | Map of performance id to ordered items |
| `addLineUpItem(unit, performanceId, { productionId?, name, note?, startsAt?, minutes?, announced?, after? })` | write | Programme planning, core's own route | Returns the item id. LU1, LU2 on the statement |
| `moveLineUpItem(unit, itemId, { after })` | write | Programme planning | `after` null puts it first |
| `removeLineUpItem(unit, itemId)` | write | Programme planning | Its line-up credits go with it |
| `createProduction(unit, input)` | write | FB-512+ action, Programme planning's `accept-entry`, import | Always draft. Input: seasonId, title, summary, categoryTermId, kind, companyName, runningMinutes, collectionIds, credits. Returns the id |
| `createPerformance(unit, input)` | write | Programme planning, import | Draft. Input adds `shape`; spaces checked active and performable on the statement |
| `movePerformance(unit, id, { spaceId, startsAt, endsAt })` | write | Programme planning | A draft moves freely; a scheduled one carries `assertSpaceFree` with the turnaround, and announces `core.performance.rescheduled` as a move by hand does today |
| `schedulePerformances(unit, performanceIds)` | write | Programme planning (publish a plan) | One conditional update per id, each with `assertSpaceFree` and the closure predicate, ids by subquery, chunked by the kit. Returns `{ scheduled, refused: { id, reason: 'space-taken' \| 'closed' \| 'not-draft' }[] }`, read back in the same batch. Two drafts that clash are caught because the second statement sees the first as scheduled |
| `listCredits(productionId, { performanceId? })` | read | Productions | Without `performanceId`, production-wide credits only |
| `addCredit(unit, { productionId, performanceId?, lineUpId?, accountId?, creditedName, role, sectionTermId, visibility? })` | write | Productions, Programme planning | LU4 on the statement |
| `updateCredit(unit, creditId, patch)`, `removeCredit(unit, creditId)` | write | Productions | A person's own visibility choice is never overwritten by a caller |
| `personBusy(accountId, from, to)`, `personsBusy(accountIds, from, to)` | read | Programme planning, Rehearsals, Front of house (FH-38 later) | Merges every `core.person-busy` contributor. Each row carries source (the contributing module's id). Advisory |
| `publicWordingFor(seasonId)` | read | Core's public pages and emails | The one contributor that applies, or the platform's words |
| setProductionCompanyName(unit, productionId, name) | write | Companies | Keeps company\_name in step with the linked company's public name; announces core.production.changed as any edit does. Story C-68 |

Write services do not check abilities. The caller's route checks its own ability on the record; core's own routes keep checking core's (`core.production.edit`, `core.performance.schedule`).

## Core points (new)

| Point | Kind | Contract | Contributors |
| --- | --- | --- | --- |
| `core.person-busy` | code | `busy(accountIds, from, to)` → `{ accountId, kind, from, to, labelKey, recordRef, firm }[]`. A contributor answers only about the accounts asked, names nobody else, and is called with ids it may chunk | Core (credits on timed performances), Front of house (live assignments), Rehearsals (published calls), Training (session places) |
| `core.public-wording` | code | `{ id, appliesTo(seasonId), terms }` where `terms` maps the public words production, performance, season, company and their plurals to translation keys | Festival. If two apply to one season, core takes the first in manifest order and the health check warns |

Core's own `core.person-busy` entry: an account credited on a production is busy for every timed performance of it, from doors (or start) to end; a per-performance or line-up credit, for that performance only. Drop-in performances make nobody busy. `firm` is true for scheduled performances, false for drafts. Programme planning also contributes: its pencils answer with firm false and are marked tentative. Availability contributes stated busy time (firm false, kind unavailable, never a reason) and arranged meetings (firm true); maybe and unknown are not busy and are not contributed.

## Public site point (new)

| Point | Kind | Contract | Contributors |
| --- | --- | --- | --- |
| `public-site.production-section` | component | `{ id, order, component, appliesTo(productionId) }`. Rendered after credits on `/whats-on/<slug>` and `/shows/<slug>`; the component fetches its own public data; `appliesTo` is a cheap read so a page with nothing to add pays nothing. Story C-69 | Festival (`festival.works`, an exhibition's works) |
| public-site.venue-section | component | { id, order, component, appliesTo(venueId) }. Rendered on /venues/\<slug>, as production-section. Story C-69 | Festival ("In this festival") |
| public-site.front-page | component | { id, component, appliesWhen() }. First applying contributor in manifest order renders /; otherwise the theatre's front page. Story C-71 | Festival (festival.site.shape = festival) |
| public-site.menu | data | { id, order, entries(), footer(), appliesWhen() }, entries { labelKey, to, order }. Placed before the theatre's own items. Story C-72 | Festival (Events, Venues) |
| public-site.production-address | data | { id, base, appliesWhen() }. While it applies, production pages live at \<base>/\<slug> and the usual addresses redirect there (temporary). One contributor at most. Story C-73 | Festival (/events) |
| core.public-lines | data | read(productionId) returns { text, placement: 'under-title' \| 'credits' \| 'footer', order }\[\]; public data only; drawn as plain text by the public production page. Story C-75 | Productions (licence billing wording) |
| core.calendar-feed | data | { id, events(accountId, from, to) } returns { key, startsAt, endsAt, allDay?, title, location?, status: 'confirmed' \| 'tentative' \| 'cancelled', transparent? }\[\]. key is the contributor's own stable record id; the module writes UID as \<contributor id>.\<key>@\<site marker>. Asked for 30 days back to 12 months ahead; cancelled events stay 30 days as STATUS:CANCELLED. title and location are public-safe (CF4). Story C-70 | Front of house (shifts), Rehearsals (calls), Training (sessions), Festival (starred events), Availability (arranged meetings), Governance (meetings) |

## Core contributes

| Point | Entry |
| --- | --- |
| `core.record-resolver` | `core.collection` (new record type, no parent) and `core.import` |
| `core.search-source` | Collections, by name |
| `core.health-check` | Two wording contributors apply to one season; a form version with a system-move loop (forms' own entry); an import left in `failed` for more than a day |
| `core.navigation` | Console > Programme > Collections and Programme > Import |

## Core events (new)

All carry ids and public or internal values only; none is internal, because none says anything about a person.

| Event | Payload | Heard by |
| --- | --- | --- |
| `core.collection.published` | collectionId | Public site cache, Festival |
| `core.collection.changed` | collectionId, productionIds added and removed | Festival (timetable filter) |
| `core.line-up.changed` | performanceId | Festival ("an event in your plan changed"), Companies (contacts' view) |
| `core.import.applied`, `core.import.undone` | importId, counts | Programme planning (refresh the board) |

Creating, moving and scheduling performances through the new services announce the events core already announces for the same acts by hand.

## Jobs

| Job | Lane | Does |
| --- | --- | --- |
| `core.apply-import` | bulk | Applies an import in chunks of at most 50 rows, each chunk one unit; a repeated chunk does nothing |
| `core.undo-import` | bulk | The reverse, in chunks |
| `core.prune-import-files` | task, daily | Deletes uploaded files older than `core.import.keep-files` |

## Identity (inside core)

No new service. The provider list in `layers/core/server/identity/providers.ts` gains the `microsoft` entry and a configured `oidc` entry; the flow in `oidc.ts` is unchanged apart from the issuer check (MS2) and the subject key (MS1, MS5). New credentials: `CORE_MICROSOFT_CLIENT_SECRET` and `CORE_OIDC_CLIENT_SECRET`, entered in Admin > Sign-in, stored encrypted like Google's.

## Forms

| Change | Detail |
| --- | --- |
| `addResponse(unit, input)` | Gains optional `versionId` (a published version of the placement's form, else refused `forms.version-not-of-form`), and returns `marking?: { score, outOf, passed, perQuestion: [{ fieldKey, correct, feedback? }] }` when that version has an answer key. Pinning a version is for host services; the public form page always answers the live version |
| `slotFormVersion(placementId, versionId)` | New read: that version's definition through `publicDefinition()` |
| `publicDefinition(definition)` | New, and the only way a definition leaves the server: strips `answer` and `marking.passMark` |
| Outcome action `core.create-production` | Declared by core, run by forms (FB-512). Extended inputs: running time, collection, credits from a repeating group (name, role, person) |
| Template `quiz` | Shipped as a file with the platform's templates |
| Slot `front-of-house.crew-call` | Declared by Front of house on record type `front-of-house.crew-call`, submission mode, one each |

Training's slot `training.quiz` is Training's and uses the above unchanged.

## Front of house

| Kind | Name | Detail |
| --- | --- | --- |
| Record type | `front-of-house.crew-call` | Parent none |
| Slot (forms) | `front-of-house.crew-call` | As above |
| Contributes `training.step-source` | `front-of-house.shadowed-shift` | Params `{ dutyId }`; `occurrences(accountIds, params, since)` → `{ accountId, occurrenceId, on, confirmedBy }` for confirmed shadowing on completed shifts of that duty |
| Contributes `core.person-busy` | Live assignments | Busy from call to end; `firm` once confirmed |
| Contributes `festival.sheet-section` | Crew on shift | Per space and operating day: duty, name, state; ability `front-of-house.shift.view` |
| Contributes `core.upcoming` | Crew call questions waiting | "Answer the StuFF crew questions" for a person signed up without answers |
| Event | `front-of-house.shadow.confirmed` | `{ assignmentId, accountId }`, internal false (ids only) |
| Event | `front-of-house.timing.recorded` | `{ performanceId, timingId, kind, at }`, internal false; again on correction with the same timingId |
| Event | `front-of-house.handout.recorded` | Internal true: it says a named person received something |

## Box office

| Kind | Name | Detail |
| --- | --- | --- |
| Service | `headcountFor(performanceIds)` | Per performance `{ admitted, walkUps, in, out, inside, capacity }` |
| Contributes `festival.headcount` | Door counts | Wraps `headcountFor` |
| Contributes `festival.told-elsewhere` | Ticket holders | `accountsAlreadyTold(performanceId, accountIds)` → those holding a valid ticket, whom Box office notifies of a change itself |
| Contributes `festival.sheet-section` | Door | Per space and day: admitted, walk-ups, inside against capacity; ability `box-office.ticket.admit` |
| Contributes `core.measure` | `box-office.headcount-in`, `box-office.walk-ups` | Keys performance, production, collection, space, day |
| Contributes `core.tonight-figure` | Inside now | For drop-in performances |
| Event | `box-office.headcount.full` | `{ performanceId, inside, capacity }` once when inside first reaches capacity, internal false |
