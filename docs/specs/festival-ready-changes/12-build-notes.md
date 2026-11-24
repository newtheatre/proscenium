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
