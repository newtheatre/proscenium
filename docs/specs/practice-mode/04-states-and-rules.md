# 3. States and rules

A practice session has four states and one store; every rule below either keeps a practice request inside its store or keeps a real request out of it. When in doubt the kit refuses: a practice screen that fails is a training moment, a practice action that lands for real is a real refund.

## The practice session

_[Diagram: practice session life cycle · 4 states]_

The session row lives inside the store, so the states are the store's own. Nothing in the real database records that a session exists.

| Rule | Change | Guard |
| --- | --- | --- |
| S1 | Start | The person is signed in, holds `core.practice.use`, `core.practice.enabled` is on, the scenario is not in `core.practice.scenarios-off`, and every module the scenario needs is switched on in the real site. Otherwise the start screen says which and offers nothing |
| S2 | Start a different scenario | A person has one store. Starting another scenario while one is active asks "Leave the door practice and start the till?"; yes ends the first (S5) before making the second |
| S3 | Making the store | In one go: apply the migration bundle, copy the configuration (part 2), make fresh signing keys, run the scenario's sample sets in the order their `after` fields give, grant the scenario's abilities, write the session row. Any failure deletes the store and shows "Practice couldn't start" with a reference to the log. Target: under 3 seconds for the first-release scenarios (proof P-PM-1) |
| S4 | Start again | Ends the store and makes a new one from the current scenario version. Offered at any time, with Undo not possible, so it asks once |
| S5 | End | Any of: the person presses Leave practice; no marked request for `core.practice.idle-end`; the show night ends (the operating day's rollover, `core.locale.day-start`); `core.practice.enabled` turned off; the scenario turned off; the person erased or merged away; a release with a different migration bundle (S7). The store's alarm deletes all its storage, its files under `practice/<account id>/` and its cache keys |
| S6 | Two tabs | Two tabs or devices of the same person share the one store, as two tills share a database. Each tab shows the same session |
| S7 | A new release | A marked request whose store was made from another migration bundle ends the session and shows "Practice was updated. Start again to carry on." Stores are never migrated |
| S8 | Resume | Opening `/practice/<scenario id>` with an active store on that scenario resumes it where it was. With the scenario at a newer version it resumes and offers Start again |
| S9 | Erasure | Identity's erasure of an account ends that person's store (S5) before the erasure reports done |

## Marking a request

_[Diagram: how the kit handles a request · 4 checks before the store]_

Read top to bottom: each check that fails ends at a refusal on the right, and only a request that passes all four runs in the store. The table gives each rule in full.

| Rule | Situation | What the kit does |
| --- | --- | --- |
| M1 | A request carries the mark (header `Proscenium-Practice: 1`) | Resolve the actor from the **real** database first: signed in, holds `core.practice.use`. Then switch the context to the person's store. A marked request from an audience account or a signed-out browser is refused `core.practice.not-allowed` (403), never served for real |
| M2 | A change (any method but GET and HEAD) or a realtime upgrade arrives without the mark, and its `Referer` path starts `/practice/` | Refused `core.practice.unmarked-request` (409) and logged as an error. This is the backstop for a page that forgot the mark |
| M3 | A marked request with no active store | Refused `core.practice.ended` (409); the frame shows the Ended screen. Only the start route makes a store |
| M4 | A marked request to Identity's sign-in, session, passkey, recovery or erasure routes, first-run setup, or core's update card | Refused `core.practice.not-in-practice` (403). Leave practice is the way out; a person cannot sign out, enrol a passkey or erase themselves inside a store |
| M5 | The client | The one fetch wrapper (`useApi` and the realtime client) adds the mark whenever the page's route starts `/practice/`. No module sets or reads the header itself |
| M6 | Abilities inside the store | The person holds exactly the scenario's `abilities`, and the facts its sample sets create (on shift tonight, for one). Their real roles do not apply. A privileged ability's "confirm it's you" prompt is shown and accepts a press, labelled "In practice this step is pretend", so nothing touches the real sign-in session |

## Nothing leaves

| Rule | What | In practice |
| --- | --- | --- |
| O1 | `externalCall` | Never runs the call. It records a row in `core_practice_calls` and returns the call's declared practice answer. A call with none is refused `core.practice.no-outside-calls`, and the screen shows the same failure it would show if the provider were down |
| O2 | Any other `fetch` from server code | A guard installed once at Worker start reads the request's context and throws `core.practice.no-outside-calls`. This covers webhook delivery, sign-in providers, Turnstile and anything a theatre's own module adds |
| O3 | Email and push | Core's mailer writes to `core_practice_outbox` instead of sending. Sealed variables, such as a sign-in link, show as "(link not shown in practice)" |
| O4 | Jobs | Run after the response, inside the store, under the same practice context. Scheduled tasks never run on their own; a scenario may list tasks the trainee can run from the practice panel, such as "Release unpaid no-shows now" |
| O5 | Realtime | Rooms carry the session's prefix, so the practice door's count moves only the practice desk's screen |

## Output that could be mistaken for real

| Rule | What | How it is marked |
| --- | --- | --- |
| P1 | Every page in a practice tab | Interface's practice banner (cannot be dismissed), a tinted border on the frame, and the page title prefixed "Practice ·". The banner is not part of any page, so no page can leave it out |
| P2 | Printing | The print stylesheet adds "Practice: not valid" across every printed page: tickets, door lists, receipts, night reports |
| P3 | Codes | Tickets, passes and door lists made in practice are signed with the store's own keys (S3). The real door refuses them as "Not a ticket for this theatre"; a practice door refuses a real ticket the same way |
| P4 | Outbox | Every email in the outbox starts with the line "Practice: this email was not sent" |

## Tasks

| Rule |  |
| --- | --- |
| T1 | After each committed marked change, the kit runs the scenario's task checks that have not passed. A check is a read-only query the scenario's own module runs on its own tables in the store |
| T2 | A task passes once and stays passed for the session, in `core_practice_task_results` |
| T3 | When every task has passed the panel says "You've done everything in this practice". In the first release nothing leaves the store. Later (PM-22) it announces `core.practice.scenario-completed` into the real database, if `core.practice.report-completion` is on |
