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

## FB-514: moves the system makes

- **Where it lives.** `systemMove` in `layers/forms/shared/engine/evaluate.ts`; `followSystemMoves` and `arrive` in `layers/forms/server/stages.ts`, called after a submission (the public route and `addResponse`), a staff move and a resubmission. Checks in `shared/engine/checks.ts`. `docs/specs/form-builder/14-changes-2026-11-24.md` rows 12 to 17 record what was built.
- **Unit size.** A chain of five fits the unit's fifty statements with room to spare only because the person is told once, at the end of the chain. A form whose system moves open review rounds or queue several actions at each step may come close; if one is ever refused as too large, the remedy is a shorter chain.
- **The loop warning** is an audit entry (`detail.loop`) on the response; the health check joins it to the form's live version, so publishing a fixed version clears it.
- **Not done.** Records' own fields (FB-508) never take system moves, since they have no stages.
