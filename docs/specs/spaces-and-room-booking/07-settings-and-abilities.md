# 6. Settings and abilities

Spaces declares 17 settings, 10 abilities and no facts. Every setting holds one value for the whole theatre and is shown in one place, the module's own settings page in the console (part 5); a value that varies by purpose or by bookable is a column on that record that falls back to the setting. Each of the 17 settings names spaces.settings.manage as the ability that changes it. One declares onChange confirm: spaces.bookings.keep-for, because shortening it lets the next retention sweep remove bookings that would otherwise have been kept, so saving it asks for confirmation and a fresh sign-in. The other 16 declare nothing and are saved without either: a changed limit applies only to bookings made afterwards.

## Settings

All are changed by holders of `spaces.settings.manage`. Audience `members` means a signed-in member's screens may read the value; `staff` means only console screens do. None is public, and none is quotable on a public page, because nothing about room booking is public.

| Key | Kind | Default | Range | Audience | Meaning |
| --- | --- | --- | --- | --- | --- |
| `spaces.bookings.slot-size` | choice | 15m | 5m, 10m, 15m, 30m, 60m | members | Every start and end falls on a multiple of this. Raising it later does not move existing bookings |
| `spaces.bookings.max-length` | duration | 4h | 15m to 24h | members | Longest single booking, where neither the bookable nor the purpose says |
| `spaces.bookings.max-ahead` | duration | 60d | 1d to 730d | members | How far ahead a booking may start, where the purpose does not say |
| `spaces.bookings.min-notice` | duration | 0m | 0m to 14d | members | Least time between asking and the start, where the purpose does not say |
| `spaces.bookings.cancel-notice` | duration | 24h | 0m to 14d | members | Cancelling later than this is a late cancellation |
| `spaces.series.max-occurrences` | integer | 52 | 2 to 104 | members | Most occurrences in one series |
| `spaces.requests.remind-after` | duration | 48h | 1h to 14d | staff | When an open request joins the approvers' daily reminder, and when it is flagged urgent before its start |
| `spaces.bumping.enabled` | boolean | true |  | members | Off means a higher tier never displaces a booking; only a performance or a closure does |
| `spaces.bumping.notice` | duration | 48h | 0m to 30d | members | A booking starting sooner than this cannot be bumped by a request |
| `spaces.bumping.contact` | text | unset | 120 characters | members | Who a bumped person should talk to: "the Theatre Manager". A role or a desk, not a private person |
| `spaces.calendar.show-details` | choice | purpose | full, purpose, busy | members | What members see of each other's bookings (rule K2) |
| `spaces.calendar.day-starts` | time | 08:00 | 00:00 to 12:00 | members | First hour drawn on the calendar |
| `spaces.calendar.day-ends` | time | 23:00 | 12:00 to 24:00 | members | Last hour drawn. Bookings outside are still listed |
| `spaces.calendar.week-starts` | choice | monday | monday, sunday | members |  |
| `spaces.reminders.before` | duration | 24h | 0m to 7d | members | When the booker is reminded. Zero sends none |
| `spaces.no-show.window` | duration | 14d | 1d to 90d | staff | How long after a booking a no-show may be set or cleared |
| `spaces.bookings.keep-for` | duration | 2y | 90d to 7y | staff | How long a booking is kept after it ends, before the retention sweep removes it |

The kind `time` is in Foundations' settings registry: a wall-clock time in the theatre's time zone, stored as `HH:MM`.

Changing the slot size, the time zone or the limits never rewrites a booking. A limit applies to what is asked for after it changes.

## Record types

`spaces.bookable` (parent `core.space`, optional: a resource has none), `spaces.booking` (parent `spaces.bookable`, owner `booked_for`), `spaces.purpose`. See part 4.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Holders in the presets |
| --- | --- | --- | --- | --- | --- | --- |
| `spaces.calendar.view` | `spaces.bookable` | normal |  |  | See a bookable's calendar, shaped by rule K2. Not audited | Fact `core.member` |
| `spaces.booking.request` | `spaces.bookable` | normal |  | `calendar.view` | Ask for a booking, and manage one's own | Fact `core.member` |
| `spaces.booking.view` | `spaces.booking` | normal | grants | `calendar.view`; `core.account.find`, so the All bookings list can be searched by booker | See any booking in full, with its booker and notes. Audited as a read | `technical-manager`, `committee-member` |
| `spaces.booking.decide` | `spaces.booking` | normal | refuses | `booking.view` | Confirm or decline a request, and record an outside owner's answer | `technical-manager`; or a grant scoped to one venue or bookable |
| `spaces.booking.manage` | `spaces.booking` | normal |  | `booking.view`, `booking.request` | Book on someone's behalf, change or cancel anyone's booking, mark a no-show, use staff-only purposes | `technical-manager`; in `small-venue`, `front-of-house-manager` |
| `spaces.booking.override` | `spaces.bookable` | privileged |  | `booking.manage` | Book outside the limits and hours, and bump inside the notice period, each with a reason | `administrator` |
| `spaces.bookable.manage` | `spaces.bookable` | normal |  | `calendar.view` | Make a space bookable, add a resource, set hours, purposes and approval | `administrator`, `technical-manager` |
| `spaces.purpose.manage` | site-wide | normal |  |  | Add and change purposes and their tiers | `administrator` |
| `spaces.report.view` | site-wide | normal |  |  | Occupancy and no-show figures, without names. Not audited | `committee-member` |
| `spaces.settings.manage` | site-wide | privileged |  |  | Change the settings above | `administrator` (and `owner`, which holds everything) |

Notes on the table:

- **Owner.** A booker always sees and manages their own booking (`booking.view` grants to the owner), and never decides it (`booking.decide` refuses the owner).
- **Scope.** Because a bookable's parent is its space and a space's is its venue, each ability on `spaces.bookable` or `spaces.booking` can be granted for one bookable, one space, one venue or the whole site.
- **Override is privileged** because it sets aside the rules everyone else is held to and can displace people at short notice. It is the only ability here that needs a fresh sign-in.
- **No ability names a role.** The last column gives the keys of Identity's preset roles that hold the ability in the presets below. A theatre maps its own roles as it likes.

## Facts

Spaces declares none. It reads two:

| Fact | Owner | Used for |
| --- | --- | --- |
| `core.member` | Identity | Presets map it to `spaces.calendar.view` and `spaces.booking.request`, so every member can book without anyone granting anything |
| `core.production-team` | Core domain | Rule P2: a purpose open to `production-team` is offered only for productions the person is on the team of |

A later fact, "has a booking in this space now", could let another module open a door or show a room's equipment list. It is not declared until something needs it.

## Presets

| Preset | On at setup | Roles | Facts | Settings that differ |
| --- | --- | --- | --- | --- |
| `student-society` | Yes | `administrator`: every Spaces ability. `technical-manager`: `booking.view`, `booking.decide`, `booking.manage`, `bookable.manage`. `committee-member`: `booking.view`, `report.view` | `core.member`: `calendar.view`, `booking.request` | none |
| `amateur-company` | No | The same | The same | `spaces.bookings.max-ahead` 180d |
| `small-venue` | Yes | `administrator`: every Spaces ability. `front-of-house-manager`: `booking.manage` | none: only staff book | `spaces.bumping.enabled` false, `spaces.calendar.show-details` purpose |

Role keys are Identity's fifteen preset roles, and this module introduces none. Identity's `owner` holds everything by its own rule. `technical-manager` is Identity's role for spaces, kit and safety, so it is the room manager here; `committee-member` is read-only oversight. There is no preset role called theatre manager or programme manager: what such a person does here sits with `administrator`.

### Purposes a preset creates

Created once, when the module is first switched on, and then the theatre's to change.

| Purpose | Tier | Open to | Needs a production | Approval in `student-society` | Approval in the other presets | Can be bumped | Created by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Maintenance and safety | 1 | staff | No | automatic | automatic | No | all three |
| Get-in, technical and dress | 2 | production-team | Yes | approval | approval | Yes | `student-society`, `amateur-company` |
| Rehearsal | 3 | production-team | Yes | approval | automatic | Yes | `student-society`, `amateur-company` |
| Audition | 3 | production-team | Yes | approval | automatic | Yes | `student-society`, `amateur-company` |
| Workshop or training | 4 | bookers | No | approval | approval | Yes | all three |
| Meeting | 5 | bookers | No | approval | automatic | Yes | all three |
| Social | 6 | bookers | No | approval | not created | Yes | `student-society` |
| Hire | 4 | staff | No | not created | automatic | Yes | `small-venue` |

In the `student-society` preset every purpose except Maintenance and safety starts needing approval: any member may ask, and one person decides each request. That is NNT's practice, where the Theatre Manager approves or declines every request, and it is Matt's decision on question 2. A theatre that wants meetings confirmed at once changes that purpose on the Purposes screen.

Performances are not in this list. They come from core and outrank tier 1.
