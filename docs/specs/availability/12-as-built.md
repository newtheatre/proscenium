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
