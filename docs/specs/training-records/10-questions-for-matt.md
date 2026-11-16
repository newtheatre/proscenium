# 9. Questions for Matt

Ten questions were put to Matt, each with a recommendation. He accepted all ten on 16 November 2026, so each is stated below as a decision, with the question kept as it was asked and the reasons and the options not chosen kept beneath it.

**Questions 6 and 10 are decided as the defaults Training give**s to the host modules, which own them.

## 1. Should other modules require competencies, or courses directly?

**Decided: competencies.** A shift role, a till or a room names "Duty manager", and the theatre says separately which courses make that up.

- For: the theatre can add First aid to Duty manager in one place without touching a single shift template; a certificate from two different providers can be two courses in one competency later; hosts never learn what a course is.
- Against: one more thing to set up. For a small theatre most competencies are one course.
- Softening that cost: creating a course offers "also make a competency of the same name", ticked by default.
- Not chosen, courses directly: `training_competencies` and its join table would go, references would name a course, and a host needing two courses would store two requirements.

## 2. Who can take training in the first release?

**Decided: members only, with staff able to add anybody by name.** Signing oneself up needs `training.place.book`, which the presets map to the fact `core.member`. A trainer or manager can give a place to any person, with or without an account.

- This matches the pain point Matt described at NNT: audiences should not meet member features. "Training" never appears on an audience screen.
- What it leaves out: a newcomer browsing and booking an induction before joining. That is story TR-32, later, as a public component a theatre drops onto its "Get involved" page.
- Not chosen: opening induction courses to any signed-in person from the start. It would need a per-course switch and a screen outside the members' area.

## 3. How should criminal-record checks (DBS in the UK) be held?

**Decided: as "seen" only.** A step can forbid files. The platform then records that a named person saw the original on a date, and when it should be looked at again. It refuses a file, a certificate number and any note of the content.

- Why: the result of such a check is criminal-offence data, which needs a legal basis and safeguards well beyond what a volunteer theatre's database should carry. Most guidance to small organisations is to record the check, not keep it.
- This is the specification's reading and not legal advice; a theatre's own safeguarding lead should confirm it for their country.
- Not chosen: allowing files for these steps as for first aid.

## 4. How long is training history kept?

**Decided: three years after a training record ends or lapses, then anonymised; evidence files for 90 days after; attendance for two years.** All three are settings.

- Three years is a common limitation period for a personal-injury claim in England and Wales, which is the usual reason to be able to show who was trained when. Other countries were not checked.
- On erasure, evidence is deleted at once and notes are redacted, but the anonymised rows stay so session counts and course history still add up.
- Not chosen: deleting everything on erasure. Simpler to explain, but an incident investigation loses its evidence the day somebody leaves.

## 5. May members send in their own certificates?

**Decided: yes, on by default.** A member uploads a first-aid certificate; it counts for nothing until a verifier other than themself accepts it.

- Off, only staff can enter evidence, which suits a theatre that wants to see every original in person.
- The setting is `training.evidence.self-submit`.

## 6. When somebody is not trained for what they are about to do, should the platform refuse or warn?

**Decided: refuse, with an audited override held by whoever runs the night.** Foundations has ruled that the host module owns this, so the decision is a default for Front of house, Bar and Spaces to adopt, not a rule in Training.

- Refuse: taking a shift, opening a till or booking the workshop is stopped, and the screen says exactly what is missing and when the next session is.
- Override: a duty manager or equivalent can allow it once, with a reason, and the audit shows who allowed it. A show does not stop because a certificate lapsed yesterday.
- Not chosen as the default: warn only, where nothing is ever blocked and the training matrix is advisory. Some theatres will want this, so each host makes it a setting with refuse as the default.

## 7. When a course's material changes, what is the default?

**Decided: the author chooses every time, with "training records stand" pre-selected and a 28-day grace when retraining is required.**

- Most new versions are small corrections. Pre-selecting retraining would cut short everybody's training for a typing fix.
- 28 days is long enough to run one extra session. It is the setting `training.versions.retrain-grace`.
- A holder then needs only the steps that changed, not the whole course.

## 8. How long should training last by default, and should early renewal keep the old date?

**Decided: two years (one year in the student-society preset); each course sets its own; renewing in the last 60 days runs from the old expiry.**

- The default is only what a new course is offered. First aid would be set to three years, an induction to never.
- Running from the old expiry means nobody waits until the last day to avoid losing time, so sessions fill more evenly.
- A training record that lapsed up to 30 days ago can still be renewed by the shorter renewal steps; after that it is the full course.

## 9. Does marking attendance need to work without a connection in the first release?

**Decided: no.** Sign-off and attendance are ordinary members' area screens that need a connection. Offline marking is story TR-31, later.

- Training rooms and rehearsal rooms usually have a signal; the door and the bar are where live mode earns its cost.
- If a theatre trains somewhere with no signal, TR-31 is the story to bring forward, built on Interface's live mode.

## 10. When training lapses, should the person be taken off future shifts automatically?

**Decided: no.** Training tells the person and whoever manages the course, and the rota shows the shift as having an unmet requirement. A person decides what to do about it.

- Removing somebody silently three weeks ahead takes away the reason to renew and leaves a hole nobody chose.
- The check is repeated at the moment that matters, when the shift starts, where question 6 applies.
- This too is a default for Front of house; it was asked here because Training's dates are what would trigger it.

## Settled without needing you

| Point | Settled by | Outcome |
| --- | --- | --- |
| "Course", not "training module"; "training record" in full; "place"; "session waiting list" | Integration, 16 November 2026 | Accepted into the shared glossary |
| Practice mode | Integration, 16 November 2026 | Out of Training; a later story for Interface with Foundations |
| One point for requirements | Foundations, 16 November 2026 | `core.requirement`, as proposed (part 4) |
| Sessions in a space | Spaces, 16 November 2026 | Through `core.space-busy`; no booking is made (part 4) |

## Settled with other workstreams

| Point | With | Outcome |
| --- | --- | --- |
| A fact mapping for one competency | Identity, Foundations | A fact declared `pin: true` may be mapped for one named record (part 4) |
| Who runs training and who teaches | Identity | No new preset role. Identity's existing preset roles receive the managing abilities, and a course's trainers are the fact `training.course-trainer` (part 6) |
| Trainers' screens | Interface | In the members' area, under `/members/training/teaching` (part 5) |
| The nine id prefixes | Foundations | Registered, no clash |
| Checking many people in one call | Foundations | `check` takes many accounts and many references |
| Sessions and the room calendar | Spaces | Read through `core.space-busy`; no booking is made (part 3, P10 and P11) |
