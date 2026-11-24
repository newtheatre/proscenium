# Build notes

What the build settled that the parts above leave open, and where it differs from them. Each entry names its story.

## FH-49: crew calls and sign-up questions

- **Where it lives.** `layers/front-of-house/server/crew-calls.ts`; the console list is `/console/front-of-house/crew-calls` and each call's page has Details, Questions, Crew and Shifts tabs. A volunteer's page for a call is `/members/front-of-house/crew-calls/<id>`.
- **No `form_id` column.** The form is whichever one is attached to the call in forms' slot `front-of-house.crew-call` (limit one), so forms keeps the only record of which form it is. The Questions tab is forms' own `FormsSlotForms`; volunteers answer on forms' page through `FormsSlotOpen`.
- **Forms reads.** Two reads were added to `#modules/forms`: `slotAsks(slot, subject)` (a published form is attached) and `slotRespondents(slot, subject)` (each person's latest sent response, leaving out withdrawn, declined and test responses). Front of house now lists forms in `requires`; forms is always on.
- **CC1.** While a call is draft or open and has a published form, `signUp` and taking cover refuse `front-of-house.crew-call.questions-first` with the remedy "Answer the crew questions first, then sign up." A manager's assignment goes ahead and answers `crewQuestions: { crewCallId, name }`, which the rota shows as a warning. Once the call is closed, its shifts follow their own sign-up rules. The member's shift page swaps Sign up for "Answer the crew questions" while they owe answers, and My account's Upcoming lists the call for anyone on its shifts without answers.
- **CC2.** One response each and changing answers come from the placement's own terms (one per person, edits after sending), set when the form is attached. Closing the call does not yet shut the form; the placement's closing date does.
- **Joining shifts.** A shift made for a performance (one at a time, or from a rota template) joins the newest draft or open call for its production's season, in the same unit. Making a call, or giving it a season, brings that season's shifts that no call holds. An occasion shift names its call (`crewCallId`). Shifts now also carry `space_id`, copied from the performance.
- **Lifecycle.** Draft to open, open to closed, closed to open again, and closed to archived once `ends_on` has passed (`front-of-house.crew-call.not-ended` before then). Names are unique among calls that are not archived.
- **Ability.** `front-of-house.crew-call.manage` is in the Front of house manager preset for new installs; a theatre already running grants it to its role by hand. `crew-call.view-needs`, the question roles and the perks counts come with FH-50; the T-shirt and meal rules are already edited on Details.

## FH-50: T-shirts, meals and handouts

- **Where it lives.** `layers/front-of-house/server/perks.ts`. The Perks tab on a crew call shows the counts; the live handouts page is `/live/front-of-house/handouts/<call>` (and `/live/front-of-house/handouts`, which opens the only running call straight away).
- **Earned (CC3, CC4).** Worked out on every read from assignments that are confirmed, asking for cover, checked in or worked on the call's shifts that are not cancelled. A meal's minutes are the shifts' scheduled length, or the minutes recorded once worked, summed per local day. "Asked for that day" matches the meal-days answer by weekday name (the template's options) or by the date itself.
- **Which question is which.** `question_roles` holds question keys; left empty, the crew template's keys (`t_shirt`, `meal_days`, `dietary`) are used where the form has them. The Questions tab sets them from the attached form's questions. Forms gains `slotQuestions` and `slotAnswers` (each respondent's latest answers by key; special-category answers opened only when the host asks).
- **Needs.** Counted for `crew-call.manage` with any need shared by fewer than three people shown as "fewer than 3"; named only in "Show list" for holders of `crew-call.view-needs`. Every "Show list" read is audited.
- **HO1.** The insert carries its own guard, so two at once give one row; the loser is refused `front-of-house.handout.already` ("Someone has just handed this out."). A handout already standing is refused naming who and when ("Already handed out by Sam at 14:02.") before the insert is tried. Undo writes a reversing row; a unique index on `reverses_id` stops a second undo. A meal must be on one of the call's days.
- **HO2.** A handout not yet earned goes ahead and answers `earned: false`; the toast says so and the counts show such handouts separately.
- **Own record.** Handing yourself a perk is refused `core.access.own-record` in the service; the Owner stands above it, as everywhere. `handout.record` sits on the crew call rather than on the person, so the kit's owner rule could not do it.
- **Retention.** Handouts are append-only. The daily sweep clears the size once the call's last day is older than `front-of-house.retention.assignments`; the rows stay.
- **Not done.** The `leading-shift` fact does not bring `handout.record`, because the fact sits on a performance and the ability on a crew call; the Front of house manager preset has it. There is no `welfare-lead` preset yet to give `view-needs` to.

## FH-48: the rota grid and batches

- **Where it lives.** `layers/front-of-house/server/grid.ts`; the screen is `/console/front-of-house/grid` (Rota grid, under Front of house, for `shift.view`; changes need `shift.manage`).
- **Show nights.** The grid's days are show nights (0014): a shift called at 01:00 sits in the night before. A night's performance shifts are only counted on the venue's own line, linking to the rota, since they are planned there.
- **Picking cells.** Each venue has its own line, so a venue with no shifts yet can still be picked. "Apply a template" makes one batch for each venue picked, on the nights picked in it; "Add shifts" makes one shift in each picked duty cell. The spec's "Add a shift here" on an empty cell is this with one cell picked.
- **Batches.** `front_of_house_shift_batches` keeps the template, venue, space, title, nights and the local call and end times. Times are wall-clock times in the theatre's zone, so a batch across the clock change keeps 18:00 on both sides; an end at or before the call is the next morning. Every shift in a batch is a draft carrying `batch_id`; a template line whose duty is archived is skipped.
- **Removing a batch.** One statement cancels the batch's shifts with no places taken, judged on the row, so a sign-up racing the removal keeps its shift. Shifts with people on them stay and are listed back for a manager to deal with one by one. A removed batch leaves the Batches list.
- **Copy to other days.** A shift not tied to a performance copies to other nights at the same local times, as drafts outside any batch. A performance's shift refuses `front-of-house.copy.performance`.
- **Not done.** The Availability soft use (maybe, busy, unknown in the grid and the assign dialog) waits for Availability's first release: no `availability.levels` exists yet.

## C-69, C-71 to C-73, C-75: what other modules add to the public site

- **Where it lives.** Contracts in `layers/public-site/server/points/` and `layers/core/server/points/public-lines.ts`; reading them in `layers/public-site/server/shape.ts` and `layers/core/server/programme/public-lines.ts`. `docs/kit/interface.md` ("What other modules add to the public site") is the guide for a contributor.
- **Name.** The spec's `core.production.public-lines` became `core.public-lines`, because a point is `<module>.<noun>`.
- **Failing contributors.** A contributor that throws counts as not applying (and a menu that throws adds nothing), so the theatre's own site always shows.
- **Shape.** `/api/public-site/shape` answers `{ frontPage, menu, footer, productionBase }`. The public-site plugin reads it once, before the first page with the default layout, into core's `usePublicShape()`; the layout puts the menu and footer entries before the theatre's own, and the catch-all page draws the front page's component at `/`.
- **Address (C-73).** While a contributor applies, the show page answers `base`; `PublicSiteProduction` redirects `/whats-on` and `/shows` there (302), and the canonical link, event data and the sitemap use it. The contributor owns the page at its base. Emails and in-app links still name `/whats-on` and `/shows` and rely on the redirect, since core cannot read a public-site point.
- **Health.** More than one applying contributor for the front page or the address gives a warning on the health page; the first in manifest order is used.
- **Lines (C-75).** Trimmed, cut to 200 characters, empty ones dropped, ordered; drawn as plain text under the title, at the end of the credits (which then shows even with no credits) or at the foot of the page.
- **Not done.** Dropping a menu entry that points at a switched-off module's page is left to the contributor, which only applies while its own module is on.
- **Tests.** `layers/public-site/tests/integration/site-shape.test.ts`, through the `festive` fixture module.

## C-67: a season's own public words

- **Where it lives.** The contract in `layers/core/server/points/public-wording.ts`; `publicWordingFor` and the clash check in `layers/core/server/programme/wording.ts`; the health check `core.public-wording`. On the public site, `usePublicWords` and the `public-site.words.*` defaults. `docs/kit/interface.md` ("A season's own public words") is the guide.
- **What changes.** The production page (the about heading, the access and effects lines of a date, the "has no warnings" sentences) and the season page's empty state take the words. The public production and season answers carry `wording`.
- **Emails and the feed.** No booking email names any of the eight words today (they say the show's title and date), so none changes. The calendar feed (C-70, lane A) should call `publicWordingFor` when it lands.
- **Failing contributors** count as not applying.
- **Tests.** `layers/public-site/tests/integration/public-wording.test.ts`, through the `worded` fixture module.
