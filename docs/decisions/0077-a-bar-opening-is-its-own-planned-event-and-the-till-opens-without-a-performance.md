# 0077: A bar opening is its own planned event, and the till opens without a performance

- Status: Accepted
- Date: 2026-09-15

## Context

Show-night authority derives from a performance. `requireNightAuthority` resolves the caller's
confirmed shift on one of tonight's performances, or falls through to the officer bypass (0044),
and both branches begin by asking the programme what is running. A venue with nothing on tonight
therefore resolves nothing, and the till answers "Nothing is running tonight, so there is nothing
to take charge of". That is right for the door and for the duty manager: with no house open there
is no admission to take and no evening to run. It is wrong for the bar. The theatre opens the bar
for external hires, for society socials and for get-in nights, and on those evenings money is
taken, stock moves and ages are checked exactly as on a show night. Module F's last open question
asked who holds till-opening and comp authority on such a night. This record answers it.

The rota cannot answer it as it stands. A shift belongs to exactly one performance: the column is
`NOT NULL`, every rota query inner-joins `performances`, and the table carries the estate's most
constrained set of invariants (one confirmed duty manager per performance, the slot ordinal unique
within its role and performance). Making `shifts.performance_id` nullable is a rebuild of that
table, which `check:migrations` refuses and 0063 would make a hand-authored exercise, and it would
silently widen every one of those queries to rows they were never written to see.

## Decision

**A bar opening is a planned event in its own right.** `bar_openings` holds a venue, a London
show-night date, a label, a start and an end, a status of `PLANNED` or `CANCELLED` and its
creator, with an index on venue and night and a CHECK that the end follows the start. It is
planned, claimed and confirmed like a rota slot, and cancelling it cancels its shifts, but it
names no performance and no show because there is none.

**Its staffing is its own table.** `bar_opening_shifts` mirrors the claim columns of `shifts`
(the holder, the status, the claim and confirmation stamps, the decline reason, the notes) with a
slot unique within its opening, the same "an open slot names nobody" CHECK, and no role column:
every slot on a bar opening is a bar slot. The claim and confirm path is the rota's own, extracted
from `server/utils/rota.ts` and parameterised by table, so a claim on an opening resolves under
the same conditional write that makes two simultaneous claims settle to one winner (E-104, 0003).

**BAR authority gains a third fact.** `requireNightAuthority(event, 'BAR', scope)` tries, in
order: a confirmed shift on one of tonight's performances; a confirmed shift on a bar opening at
tonight's venue; then the officer bypass. The first two both return `via: 'SHIFT'`. The signature
and the returned shape do not change: `performanceIds` is an empty list when the authority came
from an opening, and a new optional `openingId` names it. A consumer written against the
performance branch keeps compiling and keeps working, because an empty list is what "this evening
covers no performance" has always meant to a caller that iterates it.

**A caller with no performance names the venue.** `coverage()` is what refuses today, and for BAR
it now branches: with nothing running and a venue named, it returns that venue and an empty
performance list; with nothing running and no venue named, it refuses 400 asking for one, exactly
as it already refuses a night running at two venues. DOOR and DUTY_MANAGER keep the 403: there is
no house to work, so there is nothing to take charge of. This is what lets the bar manager's
officer role open the till on a hire night the rota never covered.

**The bypass record is unchanged.** Its target stays night, venue and role (0044), because a
matinee, an evening and a hire at one venue are still one evening's work. Its detail carries
`performanceIds: []` and the `openingId` when there is one, so the night report's staffing section
can say which opening an officer let themselves into.

**The till names its venue.** `GET /api/till/venues` answers with the venues a caller may open a
session at: venues with a performance tonight, venues with an opening the caller holds a confirmed
shift on, and every venue for a holder of `night.till`. On a 400 the till shows the picker and
reloads with `?venueId`, so naming the venue is a tap rather than a refusal the volunteer has to
decode.

## Consequences

- Everything record-like still keys to a performance, and on a bar opening there is nothing to
  key to. Sales, movements and age checks on an opening carry no performance id, which
  `age_checks.performance_id` already allows and which 0058's enforced list already excludes
  `BAR_ITEM` and `TAB_SETTLEMENT` from. A comp request on such a night records no house either.
- The rota screens gain a second thing to list. A person's own rota unions their opening shifts
  with their performance shifts, labelled by the opening rather than by a show title, and
  `/rota/manage/openings` is where an officer plans one.
- Two tables now carry a claim. The extraction that parameterises the claim helper is the price of
  not rebuilding `shifts`, and a third caller would be the signal that the abstraction is real
  rather than a coincidence.
- A bar opening on a night that also runs a performance is legal and means what it says: the
  house is open and so is a separately staffed bar. The performance branch is tried first, so
  somebody holding both resolves through the performance and keeps their `performanceIds`.
- Module F's last open question is answered and removed. Comp approval on an opening night
  follows the same widening: with no duty manager on a hire night, the officer bypass is the way
  in, and it is recorded.

## Options considered

- **A nullable `shifts.performance_id`.** Rejected. It rebuilds the rota's most constrained table
  (0063), and every rota query inner-joins `performances`, so each one would need widening to rows
  it was never written to see. The uniqueness rules that make the rota safe are all expressed per
  performance and have no meaning for a row with none.
- **A synthetic performance for the hire.** Rejected. It would appear in the programme, on the
  public listing, in the night report and in every attendance figure, and it would need a show to
  hang off. The system would be lying about what happened in the building to avoid a second table.
- **The officer bypass alone, with no ad-hoc shift.** Rejected. It works, and it makes the bypass
  the ordinary way in on every hire night, which is what 0044 says an unobserved exception becomes.
  The volunteers who actually work a hire are not officers.
- **Widening `coverage()` for all three roles.** Rejected. A door with no house is a refusal worth
  keeping, and a duty manager with no performance has no close-night and no report to sign.
