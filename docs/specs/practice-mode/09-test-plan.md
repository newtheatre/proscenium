# 8. Test plan

One proof gates the build, and twenty-seven named cases must never regress. The first case is the reason the feature exists: a full practice run leaves the real database exactly as it was.

Cases run on CI with the kit's test worker, which binds a real `PracticeStore` under workerd. Where a case says "the real database is unchanged", the test takes a row count and a hash of every table before and after.

## Proof P-PM-1 (gate, PM-01)

Run on a deployed Worker, as the first round's proofs were.

| Run | What | Pass when |
| --- | --- | --- |
| 1 | Apply the whole migration bundle to a new store | Every table, index, trigger and FTS5 search table exists; time recorded |
| 2 | A 20-statement unit whose last statement fails its `.expect` | No statement's effect is visible afterwards |
| 3 | Update a row of an append-only table | Refused by the trigger, as on D1 |
| 4 | Make a store with `core.people`, `core.tonight`, `box-office.sold-house` and a realistic copy (5 venues, 30 ticket types, 200 bar products) | Under 3 seconds at the median of 20 runs |
| 5 | A desk sale's five requests, 20 rounds, store against D1 | Store median no more than 1.5 times D1's |
| 6 | 50 stores made at once | All succeed; none sees another's rows |

## Cases that must never regress

| Case | Covers | Passes when |
| --- | --- | --- |
| T-PM-01 nothing real moves | PM-02 to PM-05, PM-20 | Each first-release scenario's walk-through (every task done, a refund, a release) leaves every real table's count and hash unchanged, and the real `core_jobs`, `core_events`, `core_audit` and ledger tables gain no row |
| T-PM-02 unmarked change refused | PM-04 | A POST with a `/practice/` referrer and no mark is refused `core.practice.unmarked-request`; the real database is unchanged |
| T-PM-03 mark without permission | PM-03 | A marked request from an audience account, a signed-out browser, and a member whom no Training course opens the scenario to is refused 403 and reaches neither database |
| T-PM-04 identity routes stay real-only | PM-04 | Marked sign-out, passkey enrolment, recovery, erasure request, setup and update-card requests are refused `core.practice.not-in-practice` |
| T-PM-05 no outside call | PM-05 | In practice, a declared call with a practice answer records it and returns it; one without is refused; a raw `fetch` throws; the mock provider records zero requests |
| T-PM-06 no email | PM-14 | A practice order sends nothing to the mailer stub; the outbox holds the rendered email with the "not sent" line; a sealed link is replaced |
| T-PM-07 copy respects data classes | PM-06 | A copied table with personal, free-text, special and encrypted columns arrives anonymised, redacted, cleared and null by each column's own rule; account columns point at Practice staff |
| T-PM-08 build refuses unsafe copy | PM-06 | `practice: 'copy'` on an audience table, a members table, the ledger, audit, or a table with a not-null special column fails the build with the file and field |
| T-PM-09 sample people are unreal | PM-07 | Every address in a fresh store's accounts ends `@practice.invalid`; every phone number is in the drama range; no name matches a real account's name |
| T-PM-10 one store per person | PM-08 | Two tabs share one store; starting a second scenario ends the first after confirmation; two people's stores never see each other's rows |
| T-PM-11 ending deletes everything | PM-09 | After each end reason, the store has no storage, no object remains under `practice/<account id>/` and no cache key under the prefix |
| T-PM-12 new release ends the session | PM-09 | A store made from bundle A meets a request from bundle B and ends with "Practice was updated" |
| T-PM-13 the frame cannot be lost | PM-10 | Every page reachable in each scenario shows the banner, border and title prefix; a page rendered without the frame component fails the browser test |
| T-PM-14 practice tickets fail at the real door | PM-11 | A ticket code from a store is refused by the real door's online and offline checks; a real code is refused at the practice door |
| T-PM-15 printing is marked | PM-11 | The print stylesheet's practice line is present on the ticket, door list and receipt prints |
| T-PM-16 fenced navigation | PM-12 | A link to a page outside the scenario's `routes` shows PM-S5 and makes no request for that page's data |
| T-PM-17 tasks tick once | PM-13 | Each task's check passes only after its action; reversing the action leaves it ticked |
| T-PM-18 jobs stay in the store | PM-15 | A job committed in practice runs in the store; the real queues receive no message; a scheduled task runs only when the trainee presses Run now |
| T-PM-19 realtime is per session | PM-15 | A practice scan updates the same session's desk screen and not a real one, nor another person's practice |
| T-PM-20 every card outcome | PM-16 | Approved, Declined, Card removed and No answer each produce the till state the real reader's answer does; the ledger postings land only in the store |
| T-PM-21 pretend re-assertion | PM-17 | A privileged step in practice accepts the pretend prompt; the real session's `reassertedAt` is unchanged; the person's real roles grant nothing inside the store |
| T-PM-22 switching off | PM-18 | Turning `core.practice.enabled` off ends an active session at its next request and hides every entry point |
| T-PM-23 erasure ends the store | PM-19 | Erasing a person mid-session leaves no store when erasure reports done |
| T-PM-24 no module reads another's tables | PM-06 | The conformance check finds no cross-module read in the copy (it goes through the kit's declarations) and no `isPractice()` in server logic outside calls and print helpers |

### Cases added with Matt's decisions of 24 November 2026

| Case | Covers | Passes when |
| --- | --- | --- |
| T-PM-25 every live page has a scenario | PM-20 | A fixture page under `/live` that no scenario's `routes` covers fails the build with its path; the live home is exempt; the six first-release scenarios together cover every `/live` page in the repository |
| T-PM-26 practice opens only through a course | PM-03, PM-12 | A member holds `core.practice.use` on scenario X only while `training.practice-open` holds: a published course they may view whose lesson names X, a current record for a version that named X, or trainer of such a course. A course archived or in preparation opens nothing; a newer version that drops X stops opening it, except through a record awarded under a version that named it |
| T-PM-27 Training switched off | PM-12 | With Training off, `/practice` offers nothing to members and every scenario to administrators, marked as checking |

## As built: P-PM-1 under workerd (24 November 2026)

`PracticeStore` (`#kit/practice/store`) is a SQLite-backed Durable Object; `storeDatabase(stub)`
(`#kit/practice/database`) is a D1Database over it, so the kit's migration runner and units of work
run against a store unchanged. `tests/integration/practice-store.test.ts` proves, on CI under
workerd:

| Run | Result |
| --- | --- |
| 1 | The whole bundle applies through the kit's own runner; the store's tables, indexes, triggers and FTS5 tables match D1's exactly (680 objects, about 175 ms locally) |
| 2 | A 20-statement unit whose last guard fails leaves no row, audit entry or event; the same unit with every guard holding commits whole; `meta.changes` counts as D1's does |
| 3 | An update or delete of `core_audit` is refused by its append-only trigger |
| 6 | 50 stores made at once all succeed and each sees only its own rows; the real database gains nothing |

Still owed before the gate closes, on a deployed Worker: run 4 (needs the first-release sample sets)
and run 5 (needs the desk sale's requests), and runs 1 and 6 timed there. The `PRACTICE` binding is
in the test Worker only; it joins the deployed Worker's configuration with the Practice mode build.
