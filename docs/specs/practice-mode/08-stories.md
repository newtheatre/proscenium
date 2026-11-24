# 7. Stories

Twenty-six stories: one gate, nineteen for the first release of practice mode, six later. Ids start `PM-` (a new prefix; nothing else in the repository uses it). UI-29 is closed by PM-02 to PM-20. Matt's decisions of 24 November 2026 are written in: every live screen has a scenario in the first release (PM-20), and practice is reached only through a Training course (PM-03, PM-12).

|  | Gate | First release | Later | All |
| --- | --- | --- | --- | --- |
| Stories | 1 | 19 | 6 | 26 |

## Gate

| Id | Story | Acceptance criteria | Rules |
| --- | --- | --- | --- |
| PM-01 | As the builder I know a Durable Object's SQLite can stand in for D1 | Proof P-PM-1 (part 8) passes on a deployed Worker: the whole migration bundle, triggers included, applies in a store; a 20-statement unit commits whole or not at all; an append-only table refuses an update; a desk sale's requests take no more than 1.5 times as long as against D1; making a store with the first-release sample sets takes under 3 seconds. A failure reopens question 1 | Part 2 |

## First release

| Id | Story | Acceptance criteria | Rules |
| --- | --- | --- | --- |
| PM-02 | As the kit I give a practice request a practice store | `PracticeStore` answers the D1 calls the kit makes; `useDb`, `all`, `first` and a unit's commit all reach the store for a marked request; one store per account id, found without a table | Part 2 |
| PM-03 | As a trainee my practice tab marks every request | The one fetch wrapper and the realtime client add the mark on every `/practice/` page; the actor is resolved from the real database before the swap; a marked request from someone without `core.practice.use` on the session's scenario (no Training course opens it, and not an administrator) is refused `core.practice.not-allowed` | M1, M5 |
| PM-04 | As the theatre I never get a practice change written for real | A change or realtime upgrade from a `/practice/` page without the mark is refused `core.practice.unmarked-request` and logged; Identity's sign-in, session, passkey, recovery and erasure routes, setup and the update card refuse a marked request | M2, M4 |
| PM-05 | As the theatre nothing leaves a practice request | `externalCall` records and returns the practice answer, or refuses with `core.practice.no-outside-calls`; any other server `fetch` in a practice context throws; `credential()` answers unset | O1, O2 |
| PM-06 | As a trainee I practise on my own theatre's setup | Tables marked `copy` are copied; personal and free-text columns pass through their erasure rule; special and encrypted columns are null; account columns point at "Practice staff"; the build refuses `copy` on audience or members tables and on ledger, audit and event tables; `core.practice.copy-configuration` off uses the shipped sample configuration | Part 2 |
| PM-07 | As a trainee I meet believable people and tonight's show | Sample sets `core.people` and `core.tonight` run in `after` order; names come from the catalogue list, addresses end `@practice.invalid`, phone numbers from the drama range; tonight's performance starts 45 minutes after the session starts | Part 2 |
| PM-08 | As a trainee I start, carry on and start again | `/practice/<id>` makes or resumes the store; one store per person, starting another scenario asks first; Start again wipes and remakes; a newer scenario version resumes and offers Start again | S1 to S4, S6, S8 |
| PM-09 | As the theatre practice cleans itself up | Leave, idle past `core.practice.idle-end`, the day's rollover, switching off, and a new migration bundle each end the session; the store's storage, its `practice/` files and its cache keys are gone afterwards; the Ended screen says which | S5, S7 |
| PM-10 | As anyone looking at a device I can tell it is practising | Every `/practice/` page has the banner (not dismissable, not scrollable away), the 4-pixel warning border and the "Practice ·" title; the banner is in the frame, so a page cannot omit it; it passes Interface's contrast checks in light and dark | P1 |
| PM-11 | As a door volunteer I cannot be fooled by practice output | Printed pages carry "Practice: not valid"; practice codes are signed with the store's keys; the real door refuses a practice ticket and the practice door refuses a real one, each as "Not a ticket for this theatre" | P2, P3 |
| PM-12 | As a learner I reach practice from my training course | A lesson's "Try it in practice" opens its scenario; `/practice` lists only the scenarios my courses open (`training.practice-open`), each naming its course; with none it says "Practice opens through a training course" and links to My training; the live home's Practise button and a screen's "Practise this screen" show only when I hold the ability; an administrator sees every scenario; an unknown or switched-off id shows "This practice isn't available" | PM-S1, PM-S2 |
| PM-13 | As a trainee I see what to try and tick it off | The panel lists the scenario's tasks; each ticks itself after the change that satisfies its check; a ticked task stays ticked; all ticked shows "You've done everything in this practice" | T1 to T3 |
| PM-14 | As a trainee I see the emails my actions would send | Every notification lands in the outbox with the theatre's wording and the "not sent" line; sealed links show as "(link not shown in practice)"; nothing reaches Email Sending | O3, P4 |
| PM-15 | As a trainee jobs and live counts behave as they would | Jobs committed in practice run in the store after the response; scheduled tasks run only from the panel's "Run now"; realtime rooms are per session, so a practice scan moves only practice screens | O4, O5 |
| PM-16 | As a trainee on the till I meet every card outcome | `payments.start-payment` answers `'ask-trainee'`; PM-S7 offers the scenario's outcomes; each produces the same till behaviour as the real reader, including the timeout path; nothing reaches SumUp | O1, PM-S7 |
| PM-17 | As a trainee I practise steps that need a strong session | Inside a store the person holds only the scenario's abilities; a privileged step shows the confirm-it's-you prompt labelled as pretend and accepts a press; the real session's assurance and freshness are untouched | M6 |
| PM-18 | As an administrator I decide what practice offers | Admin › Practice shows the five settings and each scenario's switch; changes are audited in the real database (the only real writes practice mode causes); switching off ends sessions at their next request | PM-S9, part 6 |
| PM-19 | As a person who is erased I leave nothing in a store | Erasure and the merge job call `endPractice`; the store is gone before erasure reports done; a test erases a person mid-session and finds no store | S9 |
| PM-20 | As a volunteer I can practise every live screen | The six scenarios in part 4 (door, desk sale, till, bar till, front of house night, incident) are contributed with their sample sets and tasks, and each passes its walk-through test on a fresh store; the build fails for any page under `/live`, other than the live home, that no scenario's `routes` covers | Part 4 |

## Later

| Id | Story | Acceptance criteria |
| --- | --- | --- |
| PM-21 | As a box office manager I practise refunds and exchanges | Scenario `box-office.refund`: a privileged refund and an exchange, reached from the desk; console pages it needs are allowed only once PM-25 lands |
| PM-22 | As a training manager I can count practice towards a lesson | With `core.practice.report-completion` on, finishing every task announces `core.practice.scenario-completed` into the real database, once per session; Training may sign a step off on it. The only real write a session makes, and named in the privacy notice |
| PM-23 | As a trainer I practise alongside a trainee | A trainer starts a session and shares a short join code; the trainee's devices join the same store; the trainer sees the tasks tick; the session belongs to the trainer and ends with theirs |
| PM-24 | As a trainee I practise a moment in the night | A scenario may set the store's clock, "doors open in five minutes" or "the interval", through the kit's context clock, so time-based rules behave as at that moment |
| PM-25 | As an officer I practise console screens | A scenario may open console pages, such as setting up a performance's prices; the frame works in the console shell |
| PM-26 | As a theatre I write my own practice tasks | A training manager adds tasks to a scenario from a fixed list of checks the module offers, without code |
