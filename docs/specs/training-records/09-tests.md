# 8. Tests

Training's tests exist to prove one thing above all: the answer to "is this person trained, then?" is right at every instant, including the ones nobody was watching. They are filed under the three tiers of the Foundations harness, and every case moves the kit's clock instead of waiting.

## Unit tier

Pure functions, no database. `layers/training/tests/unit/`.

| Case | Proves | Rule |
| --- | --- | --- |
| `needed-steps.first` | A person who never held the course needs the steps marked first or both | A2 |
| `needed-steps.renewal-inside-grace` | A lapse one day inside the grace needs renewal steps; one day outside needs the full course | A2 |
| `needed-steps.cut-short` | A cut-short holder needs exactly the steps that carry from nothing | A2, V6 |
| `needed-steps.revoked` | A revoked holder needs the full course whatever the dates | A2 |
| `step-met.times-required` | Two sign-offs meet a step needing two; one voided leaves it unmet | S1, S5 |
| `step-met.window` | A sign-off one day past `complete-within` no longer counts | S3 |
| `step-met.carried` | A sign-off for a step counts for a later step that carries from it, through two versions | V3 |
| `expiry.from-award` | Validity runs from the award and ends at the end of the local day | A3 |
| `expiry.early-renewal` | A renewal inside the window runs from the old expiry | A3 |
| `expiry.evidence-earlier` | Evidence expiring sooner brings the date forward | A3 |
| `expiry.clock-change` | The end of day is right on the two days the clocks change | A3, T1 |
| `expiry.never` | A course that does not expire gives no date | A4 |
| `holds.all-courses` | A competency of two courses is held only with both current | C1 |
| `holds.future-instant` | Met today, not-met at an instant after the earlier expiry, with that course named | C2, C4 |
| `holds.past-instant` | Not-met on the night before the award; met on the night after; not-met after a revocation dated between | C3 |
| `holds.until` | `until` is the earliest expiry among the courses | C4 |
| `session-states` | Every transition in part 3's tables is allowed and every other is refused | Part 3 |
| `setting-rules` | Each of the four rules across settings refuses its bad pair | Part 6 |

## Integration tier

The module against a real local D1 in workerd, through its routes and services. `layers/training/tests/integration/`.

| Case | Proves | Rule |
| --- | --- | --- |
| `last-place-once` | Twenty concurrent sign-ups for one remaining place give exactly one booked place and nineteen refusals or waiting places, and `places_taken` equals capacity | P2 |
| `last-place-control` | The same run with the check removed oversells, so the test is known to bite | P2 |
| `promote-in-one-unit` | Cancelling a booked place and promoting the first waiting person commit together; a forced failure of the promotion leaves the place uncancelled | P3 |
| `capacity-change` | Lowering below places taken is refused; raising promotes in order | P4 |
| `award-in-same-batch` | The last sign-off, the training record, the audit entry and the event are one batch; a forced failure writes none of them | A1 |
| `award-once` | Two trainers signing the last step at once give one training record | A1, A5 |
| `attendance-signs-steps` | Marking attended writes one sign-off per session step and awards where that completes the course | S6 |
| `attendance-correction` | Attended changed to absent voids those sign-offs and awards nothing afterwards | S5 |
| `sign-off-append-only` | An update or delete of a sign-off row is refused by the trigger; the erasure update of `note` alone is allowed | Part 2 |
| `void-once` | A second void of the same sign-off fails on the unique column | S5 |
| `own-acts-refused` | Signing off, verifying, awarding and marking for oneself are each refused with their code, for the Owner too | S4, A6 |
| `version-records-stand` | Publishing changes no training record and keeps progress on carried steps | V5 |
| `version-retraining` | Publishing cuts every awarded training record to the grace date in one statement, keeps the natural date, skips ones ending sooner, and queues one notice per holder | V6 |
| `version-published-frozen` | Every write path to a live version's steps is refused | V2 |
| `lapse-without-task` | With the daily task never run, a verdict turns not-met at the expiry instant | L1, L3 |
| `sweep-idempotent` | Running `training.sweep-records` twice sends one warning and one lapse notice per training record | L3 |
| `revoke-next-read` | A verdict asked after a revocation is not-met with no cache to clear | L2 |
| `evidence-gate` | Submitted evidence signs nothing; verifying signs and awards in one unit; a rejected one never does | E1 |
| `evidence-forbidden` | A file or reference on a step that forbids them is refused at the route and at the service | E2 |
| `evidence-file-access` | The subject and a verifier can open the file; a manager of the course without `evidence.verify` cannot; each verifier's opening writes a read audit | E4 |
| `requirement-source` | The source lists active competencies only, describes a retired one by its label, and answers `met` and `not-met`. With the module off the kit reports `unavailable`: a host that passed `whenUnavailable: 'met'` is not stopped, one that passed `'not-met'` withholds, and both answers say the source was unavailable | C4, T2 |
| `requirement-two-queries` | Checking forty accounts against three competencies makes at most two queries | Part 4 |
| `fact-matches-requirement` | The fact and the provider agree for every person in a seeded set, at now | Part 4 |
| `competency-change` | Adding a course changes who holds it from the next read and is audited | C5 |
| `events-internal` | Every event whose payload has an account id is declared internal and is never offered to a webhook | Part 4 |
| `events-payload-classes` | No payload carries a personal, free-text or special value | Part 4 |
| `merge-collisions` | Merging two accounts that each hold a place on one session and a live training record for one course leaves one of each, the later expiry kept | Part 2 |
| `erasure-walk` | Erasing an account deletes evidence rows and files, redacts every note, and leaves counts on sessions unchanged | Part 2 |
| `download-complete` | A person's download holds every Training row whose subject is them, and their evidence files | Part 2 |
| `retention-sweep` | An ended training record and its listed sign-offs are anonymised on the due date, not a day before | Part 2 |
| `abilities-matrix` | Every route refuses without its ability and allows with it, at site, course and ownership scope | Part 6 |
| `module-off` | Every route answers 404, tasks are skipped, the fact grants nothing; switching on restores the same verdicts | T2 |
| `space-busy` | A published session reports its space busy; an unpublished or cancelled one does not; the space cannot be deleted | Part 4 |
| `course-trainer-fact` | A person listed as a trainer of one course may run its sessions and sign off its steps there and at no other course; removing them ends it at the next read; naming a trainer needs the course's manage ability and no grant through Identity | Part 6, the facts |
| `session-space-taken` | Publishing a session into a space that is taken, or moving a published one there, is refused with `training.session.space-taken` and names what holds the space | P10 |
| `fan-out-set-wise` | Cancelling a session with forty places, and marking forty people attended, each stay inside `core.units.statement-limit`; cutting short a course held by more people than `core.units.set-rows-limit` is one statement and one job | T4, V6 |

## End-to-end tier

A browser against the built Worker. `layers/training/tests/e2e/`. Each runs at phone and laptop width and includes the automated accessibility check.

| Case | Journey |
| --- | --- |
| `course-to-training-record` | A training manager creates and publishes a course with one practical step and names a trainer; the trainer signs a member off on a phone; the member sees "Current" with the right date |
| `session-night` | A session is published; three members sign up for two places; one waits; one cancels and the waiting member is promoted; the trainer marks attendance and closes; both attendees hold the course |
| `renew-before-lapse` | With the clock moved to inside the warning period, the member sees the card, signs up, attends, and the new date runs from the old expiry |
| `retraining-required` | A new version is published as retraining required; the dialog names the number of holders; a holder sees "Ends early", completes the one changed step and is current again |
| `certificate` | A member adds a certificate with a file; a verifier checks it; the member is current until the certificate's date; the verifier cannot verify their own |
| `requirement-refusal-shown` | Using the worked-example host module from the test harness, an act needing a competency is refused with Training's reason and the next session, then allowed after sign-off |
| `keyboard-and-reader` | M8 and M9 are completed with the keyboard alone, and every status is announced as a word |

## What is not tested here

- How Front of house, Bar or Spaces enforce a verdict. Their own tests cover that; Training's stop at the verdict.
- Delivery of notifications, which core tests. Training asserts only that the right notification was handed over inside the unit.
- Offline marking, which is a later story.

## Fixtures

One seeded theatre shared by all three tiers: four courses (one that never expires, one with two practical steps needing two sign-offs each, one certificate course that forbids files, one with a version history of three), two competencies sharing a course, and twelve people covering every row of part 3's "which steps are needed" table.
