# 12. As built

Where the build departs from, or is narrower than, parts 1 to 11. The build is the reference from here on.

## Gate, first part (AV-01 to AV-03, AV-05, AV-06, AV-08), 24 November 2026

- **Tables.** Six of the fourteen so far: profiles, patterns, pattern lines, exceptions, requests and the people a request asks. The rest arrive with the slices that write them (polls, meetings, calendar imports).
- **Levels** are worked out on read, per day, in `layers/availability/server/levels.ts` (`resolveDay`), from one read per table for everyone asked (`server/reading.ts`). Rows of merged accounts read as their survivor's through the account scope, so the module has no merge handler yet; where two patterns of one survivor overlap after a merge, the one changed last wins.
- **Overlapping patterns** are refused twice: by a check that names the pattern in the way, and by the insert or update itself, which carries the no-overlap predicate and is guarded with `expect(1)`.
- **Removing an exception** that began before today keeps its past days by ending it yesterday (A3); one wholly in the past is refused.
- **Reasons.** A shared reason shows to a viewer only when the person is in a group the viewer plans for (A7); `availability.find.anyone` sees levels without reasons. People a viewer may not plan for are left out and counted in `hidden`.
- **Requests.** `openRequest` answers the open request for the same `sourceRef` instead of opening a second. The people asked are the groups' members by subquery plus those named, over live accounts and their survivors, written in one set and told once. Joiners, leavers and reminders follow with AV-09 and AV-10; the daily task so far lapses and closes only.
- **Event.** A change of entries announces `availability.entry.updated` with the account and the dates touched, no levels or reasons (A6). The kit's naming rule needs the past participle.
- **Settings** so far: `grid.step`, `entry.unmarked-default` and `entry.horizon`. `grid.step` and `entry.horizon` have audience signed-in, because My availability reads them; the rest stay staff.
- **Abilities** are declared with the first code that needs them: `find.anyone`, `request.send` and `settings.manage`. Entering one's own availability needs only a sign-in until `own.manage` has a screen to gate; `find.use` and `entry.on-behalf` arrive with Find a time and on-behalf entries.
- **Not yet:** the S1 screen (AV-04), the `core.person-busy` contribution (AV-07, once lane A's support module is on `next`), Productions' and Rehearsals' group contributions, and retention.

Tests: `layers/availability/tests/integration/gate.test.ts` (through the routes and services, with the fixture module `crews` contributing a group kind) and `layers/availability/tests/unit/levels.test.ts`.

## My availability (AV-04, S1 and S3), 24 November 2026

- **Screen.** `/members/availability`, in the members' menu for everyone signed in. A week from Monday on a computer, three days on a phone, moved with Earlier and Later; the first day in view is in the address (`?from=`). The grid (`AvailabilityWeekGrid`) is shared with the request and Find a time screens to come.
- **Painting.** Choose Free, Maybe, Busy or Clear, then drag down one day with a mouse, or tap (or press Enter on) where the stretch starts and then where it ends; arrow keys move between cells. A day's heading paints the whole day. Each stroke is one `POST /api/availability/paint` for one day.
- **Clear** takes back what was painted: it cuts the stroke out of the person's entries on that day, so the day falls back to the pattern or to unmarked time. An entry over several days keeps its other days, split into pieces that keep the entry's `created_at`, so which entry wins (A4) never changes.
- **Pattern days.** The first stroke on a day a pattern covers asks "Just these days" or "Change the pattern", and the answer holds for the visit; a select beside the palette changes it. "Change the pattern" cuts the stroke into that weekday's lines and joins neighbours of one level; with no pattern covering the day it is refused `availability.pattern.none`. Creating and dating patterns is S2, the next slice.
- **Read.** `GET /api/availability/me` takes dates (`from`, `to`, at most 62 days) and answers each day's pieces in minutes past midnight, worked out per A4 with the person's own reasons, so the grid needs no time-zone arithmetic. It also answers the grid settings and the requests asking the person, with "This is right" on the screen.
- **Settings** `grid.day-starts` (09:00) and `grid.day-ends` (23:00, at most 23:59, the kit's time kind) are added; the grid opens scrolled to the first.
- **Not yet:** commitments on the grid (after `core.person-busy`), calendar imports (S14), S2 patterns, S4 and S5 as pages of their own.

## Weekly patterns (S2), 24 November 2026

- **Screens.** `/members/availability/patterns` lists the person's patterns, newest first, with their dates and the days they mark; "Remove" asks first. "New pattern" takes a name, a first day, an optional last day and, in place of "Copy from last term", a choice of any earlier pattern whose times to copy (the newest by default). It opens the pattern's page.
- **Editing** happens on `/members/availability/patterns/<id>`: the name and dates above the same grid as My availability, showing a typical week (Monday to Sunday). Strokes change the page only; "Save pattern" sends the name, dates and every line in one `PUT`, and leaving with changes asks first. A clash with another pattern's dates is refused naming it, as before.
- **A mouse click** paints the one cell clicked; dragging paints a stretch. Tapping start then end is for touch screens and the keyboard.
- **Read.** `GET /api/availability/patterns` answers the person's own patterns with their lines and the grid settings.
