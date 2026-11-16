# 4. Interface to other modules

Spaces requires only core, offers no point of its own, and reaches every other module through services, events, points and facts as the Foundations formats define them. This part ends with the index of every name it declares, what is agreed with the other workstreams, and the one point still open with them.

## The module

| Module | Id | Requires | Uses | Can be switched off | Owns |
| --- | --- | --- | --- | --- | --- |
| Spaces | `spaces` | nothing (core is never listed) | `forms` | Yes | The seven tables in part 2 |

```ts
// layers/spaces/module.ts
export default defineModule({
  id: 'spaces',
  manifest: 1,
  since: '0.5.0',
  stability: 'experimental',
  requires: [],
  uses: ['forms'],

  settings, abilities, records, tables,

  events: {
    announces: { /* the table below */ },
    listens: {
      'core.performance.scheduled':   'performance-changed',
      'core.performance.rescheduled': 'performance-changed',
      'core.performance.moved':       'performance-changed',
      'core.closure.created':         'closure-created',
      'core.space.archived':          'place-archived',
      'core.venue.archived':          'place-archived',
    },
  },

  jobs: {
    'spaces.clear-window': job({ lane: 'bulk' }),
  },

  tasks: {
    'spaces.sweep-bookings':   task({ every: '15m' }),
    'spaces.send-reminders':   task({ every: '15m' }),
    'spaces.remind-approvers': task({ dailyAt: '09:00' }),
  },

  contributes: { /* the table below */ },
  presets: { /* part 6 */ },
})
```

The `since` version is a placeholder until the roadmap places the module. `forms` is always on, so listing it in `uses` rather than `requires` only records that Spaces works without calling it.

## Record types

| Record type | Table | Parent | Owner column |
| --- | --- | --- | --- |
| `spaces.bookable` | `spaces_bookables` | `core.space`, optional: set for a space, none for a resource | none |
| `spaces.booking` | `spaces_bookings` | `spaces.bookable` | `booked_for` |
| `spaces.purpose` | `spaces_purposes` | none | none |

So a grant on a venue reaches its spaces, their bookables and their bookings: "approver for everything in the Studio building" is one grant. A resource is reached by a site-wide grant or one on the resource itself. Foundations lets a record type mark its one parent type optional, so `spaces.bookable` declares the parent `core.space` as optional and a resource inherits nothing.

## Services

Named exports of `layers/spaces/server/services.ts`, imported as `#modules/spaces` by a module that lists `spaces` in `requires`. A service that writes returns statements for the caller's unit of work and never commits.

| Service | Returns or does |
| --- | --- |
| `getBookable(id)`, `bookableForSpace(spaceId)` | One bookable, or null if the space is not bookable |
| `listBookables({ kind, venueId, state })` | Bookables in display order |
| `listBookings({ bookableId, from, to, states, bookedFor, productionId })` | Bookings in a window, in time order |
| `getBooking(id)`, `bookingOfOrigin(type, id)` | One booking |
| `blockersOf(bookableId, from, to)` | Everything in the way of a window: bookings, performances, closures, each with its kind and times |
| `isFree(bookableId, from, to)` | True when `blockersOf` is empty |
| `checkRequest(input)` | Runs rules P1 to C1 without writing. Returns allowed, needs approval or refused, with the rule. The request form calls it as the person types |
| `requestBooking(unit, input)` | Statements that make a booking or a request under every rule. `input` may carry an origin. Returns the id and the state it will have |
| `changeBookingOfOrigin(unit, type, id, changes)` | Statements that move or rename the booking another module's record owns |
| `cancelBookingsOfOrigin(unit, type, id)` | Statements that cancel them, with reason `origin-removed` |

**Bookings made by another module.** Production management (a rehearsal) or a theatre's own module makes a booking by calling `requestBooking` inside its own unit, passing its record as the origin. The booking and the caller's record are then saved together or not at all. Such a module lists `spaces` in `requires`: a module that only uses Spaces may not call these services (Foundations' rule M3). The booking's page links to the origin through `core.record-resolver`, and shows "managed by" in place of the edit controls: the owning module is where it is changed. The caller chooses the `booked_for` account and the purpose; the rules apply as for anyone. Training is not such a caller: it reports a session's room to core, and Spaces sees it there (rule C1a).

## Events Spaces announces

Payloads carry ids and times, never names or free text. Every event carries `bookingId` and `bookableId`.

| Event | When | Payload beyond those two |
| --- | --- | --- |
| `spaces.booking.requested` | A booking enters Requested | `startsAt`, `endsAt`, `seriesId` if any |
| `spaces.booking.confirmed` | A booking enters Confirmed, on asking or on a decision | `startsAt`, `endsAt`, `seriesId`, `decided`: true or false |
| `spaces.booking.declined` | The move happens |  |
| `spaces.booking.withdrawn`, `spaces.booking.expired` | The move happens |  |
| `spaces.booking.changed` | The time or bookable of a Confirmed booking changes | Old and new bookable, start and end |
| `spaces.booking.cancelled` | The move happens | The reason code, `late`: true or false |
| `spaces.booking.bumped` | The move happens | The reason code, `bumpedById` if any |
| `spaces.booking.completed` | The sweep marks it |  |
| `spaces.booking.no-show` | The mark is set or cleared | `set`: true or false |
| `spaces.bookable.created`, `spaces.bookable.paused`, `spaces.bookable.archived` | The move happens | No `bookingId` |

A series announces one event per occurrence, so a listener never needs to know series exist. All are version 1.

## Events Spaces listens for

| Event | From | What Spaces does |
| --- | --- | --- |
| `core.performance.scheduled`, `.rescheduled`, `.moved` | Core | Rule L1: bumps overlapping bookings in the space, declines overlapping requests |
| `core.closure.created` | Core | Rule L2 |
| `core.space.archived`, `core.venue.archived` | Core | Rule L4 |
| `core.account.merged` | Identity | Nothing by event: rows move by column declaration. Listed so the dependency is visible |

Each listener is safe to run twice: it acts only on bookings still Confirmed or Requested.

## Points Spaces offers

None. A check that belongs to another module, such as "this room needs an induction", is a requirement held on a bookable or a purpose and judged through core's point `core.requirement` (rule P13). Foundations requires this of every module: none declares its own point for a condition on a person. So Training and Membership are named nowhere in this module and are not in `uses`.

## What Spaces contributes

| Point | Owner | Contribution |
| --- | --- | --- |
| `core.space-busy` | Core domain | For a space and a window, the Confirmed bookings of its bookable. Each is marked as yielding, so a performance scheduled over one is warned about and not refused |
| `core.change-impact` | Core domain | For a performance being scheduled or moved, a closure being created, or a space or venue being archived: "3 room bookings will be bumped and 1 request declined" |
| `core.delete-guard` | Core domain | Refuses deleting a space that has a bookable with any booking; archive it instead |
| `core.record-resolver` | Foundations | `spaces.bookable`, `spaces.booking`, `spaces.purpose`: label, address and parent |
| `core.erasure-handler` | Foundations | Cancels the erased person's future bookings and open requests (part 2) |
| `core.privacy-record` | Foundations | "Room bookings: who booked which room and when, what for, and any note they wrote. Kept for the retention period" |
| `core.setup-step` | Foundations | "Choose which spaces can be booked", not required, and "Check the purposes list" |
| `core.health-check` | Foundations | A bookable has no approver; a request has waited more than three times the reminder period; a bookable is open at no time |
| `core.navigation` | Foundations | The entries in part 5 |
| `core.notification-topic`, `core.notification-type` | Core domain | The topic and types below |
| `core.export-contributor` | Identity | A person's bookings in their data download |
| `core.home-card` | Interface | "My room bookings" (next three, with a Book button) on the members' home; "Booking requests to decide" with a count on the console home |
| `core.quick-action` | Interface | "Book a room" |
| `core.record-tab` | Interface | A "Room bookings" tab on a space's console page, on a venue's and on a production's. The production's tab lists upcoming bookings that name the production and has a Book button for its team |
| `core.search-source` | Interface | Bookables by name, and bookings by title for people who may see titles |
| `forms.slot` | Form builder | The form slot `spaces.booking-request`: extra questions on the request form, per purpose. Later, with story SP-38, and open with the Form builder (the open point below) |

### Notification topic and types

One topic, `spaces.bookings`, side `members`, labelled "Room bookings" on the preferences screen. Email and inbox are the allowed channels for all.

| Type | Category | Sent to | Sent when |
| --- | --- | --- | --- |
| `spaces.booking.confirmed` | Transactional | The booker | A decision confirms a request. Not sent for a booking confirmed on screen as it was made |
| `spaces.booking.declined` | Transactional | The booker | A request is declined, with the approver's note |
| `spaces.booking.expired` | Transactional | The booker | A request ran out of time |
| `spaces.booking.bumped` | Transactional | The booker | Rule B4 |
| `spaces.booking.cancelled-by-staff` | Transactional | The booker | Rule X5 |
| `spaces.booking.made-for-you` | Transactional | The person booked for | Staff or another module made a booking in their name |
| `spaces.booking.reminder` | Optional | The booker | The reminder task |
| `spaces.request.new` | Optional, may join a digest | Holders of `spaces.booking.decide` on the bookable, through `notifyHolders` | A booking enters Requested |
| `spaces.request.waiting` | Optional | Each approver | The daily reminder |
| `spaces.series.summary` | Transactional | The booker | A series is decided: one message listing every occurrence and its outcome |

A series sends the summary and not one message per occurrence; each type's coalescing window is set so twenty bumps from one closure reach a person as one message. A listener that bumps many bookings hands the notification service one set of recipients, not one call each (rule L1's note on many bookings at once).

## Routes

All under `/api/spaces/`, written with `defineRoute`. None is public.

| Route | Ability | Purpose |
| --- | --- | --- |
| `GET /api/spaces/bookables` | `spaces.calendar.view` | Bookables the caller may see |
| `GET /api/spaces/calendar?bookables=&from=&to=` | `spaces.calendar.view` on each | Bookings, performances and closures in a window, shaped by rule K2. At most 31 days |
| `POST /api/spaces/bookings/check` | `spaces.booking.request` | `checkRequest` |
| `POST /api/spaces/bookings` | `spaces.booking.request` | Make a booking or a series. Idempotent |
| `GET /api/spaces/bookings`, `GET /api/spaces/bookings/<id>` | Owner, or `spaces.booking.view` | A person's own, or any |
| `PATCH /api/spaces/bookings/<id>` | Owner, or `spaces.booking.manage` | Rules X1 to X3 |
| `POST /api/spaces/bookings/<id>/cancel`, `/withdraw` | Owner, or `spaces.booking.manage` |  |
| `POST /api/spaces/bookings/<id>/decide` | `spaces.booking.decide` | Confirm or decline. Idempotent |
| `POST /api/spaces/bookings/<id>/external-placed` | `spaces.booking.decide` | Rule E2 |
| `POST /api/spaces/bookings/<id>/no-show` | `spaces.booking.manage` | Set or clear |
| `POST /api/spaces/series/<id>/decide`, `/cancel`, `PATCH /api/spaces/series/<id>` | As for a booking | Rules A7, R6, R7 |
| `GET /api/spaces/requests` | `spaces.booking.decide` | The approval queue, each with its clashes |
| Everything under `/api/spaces/bookables/`, `/purposes/` that writes | `spaces.bookable.manage`, `spaces.purpose.manage` | Setup |

No address prefix needs reserving: every page is under `/members/spaces` or `/console/spaces`.

## Jobs and tasks

Three tasks, in part 3, and one job. A series is at most 104 rows and is written in the request as one set. A listener's bumps are written in the listener's own unit as sets, as Foundations' rules U7 to U9 require. The job `spaces.clear-window`, in the bulk lane, exists for the rare blocker with more bookings in its way than `core.units.set-rows-limit` allows in one set: the listener changes the soonest and queues the job with the blocker's id, and the job repeats in chunks, each its own unit and safe to repeat, until none is left.

## Index of names

For the Foundations index (its tab 4), sent on 16 November 2026.

| Kind | Names |
| --- | --- |
| Module id and table prefix | `spaces`, `spaces_` |
| Id prefixes, all time-sorted | `bkb` spaces\_bookables, `bpu` spaces\_purposes, `bks` spaces\_booking\_series, `bkg` spaces\_bookings, `bke` spaces\_booking\_events |
| Keyed by their own columns | spaces\_opening\_hours, spaces\_bookable\_purposes |
| Record types | `spaces.bookable`, `spaces.booking`, `spaces.purpose` |
| Points | none |
| Facts | none |
| Form slots | `spaces.booking-request` |
| Notification topic | `spaces.bookings` |
| Refusal codes | `spaces.clash`, `spaces.rule` (with the rule id), `spaces.not-bookable`, `spaces.too-late` |
| Tasks | `spaces.sweep-bookings`, `spaces.send-reminders`, `spaces.remind-approvers` |
| Jobs | spaces.clear-window |
| Counts | spaces.requests-open |
| Settings, abilities, events, notification types | Listed in part 6 and in the tables above, all under the prefix spaces. |

## Agreed with the other workstreams

Everything in this table was agreed on 16 November 2026 and is already written into the parts named. It is kept here so a reader can see which choices are another workstream's and not this module's to change.

| With | Agreed | Where it shows here |
| --- | --- | --- |
| Foundations | A record type may mark its one parent type optional. The five id prefixes are registered. The settings registry has the kind `time`. A condition on a person goes through the one point `core.requirement`: the host stores a reference as plain text, `<source>:<id>` (such as `training:tcmp_...`) or `fact:<name>`, and calls the kit's `requirements.check` with the account and an instant. A verdict is `met`, `not-met` or `unavailable`, with `until` and a reason. The kit only reports `unavailable`; the host chooses what that means. No module declares its own point for a condition on a person. A fan-out is written set-wise (its rules U7 to U9) | Record types above; part 2; rules P9, P13, R1 and L1; part 6 |
| Core domain | A `core.space-busy` contribution may mark its times as yielding: a performance over them is not refused, and the scheduler is warned through `core.change-impact`. `assertSpaceFree(spaceId, from, to)` is a statement predicate, false when a scheduled performance or a blocking closure overlaps. Times that do not yield would need a predicate from their contributor; every room booking yields, so Spaces supplies none. A tab is added to a record page through `core.record-tab` and no other point. Closure scope is core's to resolve, worked out when asked and never read from the event: listClosures({ from, to, spaceId, venueId, blocking }) returns the closures and public holidays overlapping a window, with spaceId only those covering that space (its own, its venue's or the whole theatre's), each row carrying its scope; closureSpaceIds(closureId) returns the active spaces one closure covers, for showing; closureSpaces(closureId) is a statement fragment selecting the same ids, for a set-wise write | Rules C1a, C2 and L1; proof run P-7; the contributions above |
| Identity | A record type's owner may be any one account column, so an ability can refuse the owner `booked_for`. Presets use Identity's fifteen role keys and add none: here `administrator`, `technical-manager` (spaces, kit and safety), `committee-member` (read-only oversight) and `front-of-house-manager`. Mapping `core.member` to `calendar.view` and `booking.request` is right, on two conditions: a fact must not hand out other people's details, and `core.member` holds even where the members' area is off. Asking on someone's behalf gives no rights by itself | Rules A2, K2 and P11; the console access in part 5; part 6 |
| Interface | One shared Calendar component in the core set, its story UI-35 in roadmap phase 4: day and week views with a column per space, a List view with the same items and actions, state shown as a word and a border as well as a colour, eight named colours `calendar-1` to `calendar-8`, no month view, and acting on a block opens the record's side panel. The console group is labelled "Room bookings", as Matt decided; the module id and addresses stay spaces | Part 5; `colour` in part 2. Spaces cannot ship before phase 4 |
| Integration | Across modules the words are "room booking"; "booking" alone is used only inside this document. Training does not book through Spaces: it reports a session's use of a space through `core.space-busy`, and a room that needs training says so through `core.requirement` | Glossary; rules C1a and P13 |

### Still open

| # | With | Open point | Until it is settled |
| --- | --- | --- | --- |
| 1 | Form builder | That a module may declare a form slot whose placement varies by one of its own records (the purpose), and how the answers are saved with the booking, given that a module that only uses another may not call its services | To be raised when story SP-38 is written. Failing it, the extra questions are one form for all purposes |

## What others may need from Spaces

- **Production management** will hold rehearsals and call `requestBooking` with an origin. Nothing here waits for it.
- **Training** does not book through Spaces. It reports a session's use of a space to core, and Spaces sees it there (rule C1a). A room that needs an induction says so through core's requirement point (rule P13).
- **Front of house** needs nothing: a performance's room is core's.
- **Box office** needs nothing. A space's seating plan is Box office's and unrelated to its diary.
- **Reports** will read occupancy through `listBookings`.
