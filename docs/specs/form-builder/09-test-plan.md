# 8. Test plan

Twenty-seven named cases must never regress. Each has a name a contributor can search for, runs in one of the platform's three tiers, and protects a promise made elsewhere in this document.

## Named cases

### Races and exactly-once

| Name | Tier | Proves |
| --- | --- | --- |
| The last place | Integration, D1 | With a cap of n, n + 1 concurrent submissions store exactly n responses, and the loser is told the form is full |
| The last audition slot | Integration, D1 | A limited option with one place left is taken once under concurrent submissions |
| The double submit | Integration, D1 | The same submission sent twice, or retried after a timeout, stores one response and one event |
| One each | Integration, D1 | Two concurrent submissions by one person to a one-each placement store one; a withdrawal frees the place |
| The decision made twice | Integration, D1 | Two people deciding one response at the same moment produce one stage change; the second is refused |
| The production created once | Integration, D1 | An outcome action retried after a failure creates one record, by its idempotency key |
| Two editors | Integration, D1 | A draft save with a stale revision is refused and overwrites nothing |
| All or nothing at checkout | Integration, D1 | When a host's unit of work fails, no response, answer, count or event from `addResponse` remains |

### The engine

| Name | Tier | Proves |
| --- | --- | --- |
| Browser and server agree | Unit, both runtimes | The shared case set gives identical results in the Worker runtime and a browser |
| The hidden answer | Integration | A value sent for a question the server finds hidden is not stored |
| The forged fact | Integration | A browser that claims to be a member, or sends its own total, is ignored; the server's facts and calculations stand |
| No way back | Unit | A definition with a route to an earlier page, or calculations in a circle, cannot be published |
| Pennies | Unit | Money calculations stay in integer minor units and round once, including a three-way split of an odd amount |
| Midnight | Unit | Date comparisons and "today" use the theatre's time zone and operating day, across a daylight-saving change |

### Versions

| Name | Tier | Proves |
| --- | --- | --- |
| The frozen version | Integration, D1 | An update or delete of a published version is refused by the database |
| The answer that kept its question | Integration | After a question is retired, its earlier answers are still read, exported and erased under the retired question |
| The draft that crossed a publish | End to end | A respondent mid-draft when a new version is published keeps their answers, is told what changed, and submits against the new version |
| The older deployment | Upgrade | A release reads and serves forms written in the previous two definition formats |

### Access

| Name | Tier | Proves |
| --- | --- | --- |
| The locked-out reviewer | Integration | A conflicted reviewer is refused by every route that returns anything about the response: page, list, API, export, summary, search, notification. The Owner role is refused in the same way |
| Blind until released | Integration | Before release no reviewer can obtain another's scores, including through a summary that would reveal them by subtraction |
| Not your own | Integration | A person cannot decide, review or move a response they submitted, whatever abilities they hold |
| The restricted answer | Integration | A special-category answer is ciphertext at rest, absent from the table and export without `read-special`, and each reveal is audited |
| The id is not a key | Integration | An invitation or a link to resume a draft works only with its token; knowing the row's id opens nothing, and the token is stored only as a hash |
| Found by address | Integration | A response made while signed out appears in My forms once its address is verified on an account, and to nobody before that |

### Privacy

| Name | Tier | Proves |
| --- | --- | --- |
| Erased everywhere | Integration, D1 | Erasing a person treats their answers in every form by class, deletes their drafts and files, and leaves counts and history intact, in one unit of work |
| Gone on time | Integration | The retention sweep anonymises a response the day after its date and not the day before |
| Quiet by default | Integration | No response, review or action event reaches a webhook unless the form opts its response events in, and no event payload ever carries an answer, a name or free text |

## What each tier covers

| Tier | Covers here |
| --- | --- |
| Unit | The engine: every comparison, function and validation rule at its boundaries; the publish checks; the change classifier |
| Integration against D1 | Every service and route: guards, constraints, units of work, the per-row erasure, the queue jobs |
| End to end in a browser | Building and publishing a form; filling one in on a phone width with a dropped connection; a full proposals round from opening to decision |
| Module isolation | The suite with each contributing module switched off: pickers, bindings and actions degrade as tab 4 says |
| Upgrade | Forms and responses created on the two previous releases still open, validate and export |

## Properties checked by generated cases

The engine is small and pure, so it suits tests that generate many random definitions and answer sets.

- Evaluation always finishes, and gives the same result when run twice.
- Following routes from the first page always reaches an ending.
- No answer to a hidden question appears in what is stored.
- A definition the publish checks accept never makes the engine throw.

## Accessibility and usability

- **Automated checks** run on the builder, the filler, the review screen and every question type in every state (empty, filled, error, read-only), to WCAG 2.2 AA.
- **By hand before each release:** build a five-question form with one condition, and fill in the proposal template, using only a keyboard and then a screen reader.
- **The first-time builder test.** Before each release, someone who has never built a form is asked to publish a joining form from blank. They pass if they finish unaided in 15 minutes. What stopped them is recorded and becomes an issue. This is the paper's requirement, and the measure of whether this module does better than its reference.

## Fixtures

- The ten shipped templates are test fixtures: each must pass the publish checks and be fillable end to end.
- The shared engine case set lives beside the engine and is the same file for both runtimes.
- Seed data for the demo site includes one form in each state and a proposals round part-way through review, with random people generated at run time.
