# 1. Scope and glossary

Training answers one question for the rest of the platform: is this person trained to do this, on this date? Everything in the module exists to make that answer true, current and explainable.

## In scope

| Area | What the module does |
| --- | --- |
| Courses | A catalogue of what the theatre teaches, each with versions, steps, a validity period and the people who may train it |
| Sign-offs | One step confirmed for one person: by a trainer, by attendance at a session, by the person's own confirmation of reading, or by a verified certificate |
| Training records | Awarded when every step is signed off; expiry, renewal, cutting short when material changes, revocation |
| Certificates | First-aid, safeguarding and similar certificates issued elsewhere, held as evidence against a step, with their own expiry date |
| Competencies | Named things a person may be trusted to do, each made of one or more courses |
| Requirements | The answer other modules ask for: does this person hold this competency at this moment |
| Sessions | Dated training sessions with capacity, sign-up, a waiting list, trainers and attendance |
| A person's own view | What I hold, what is about to lapse, what I am part-way through, what I can sign up for |
| Oversight | Who holds what, who is lapsing, the matrix of people against competencies, exports |

## Out of scope

| Left out | Why | Where it belongs |
| --- | --- | --- |
| Practice mode for operational screens | The catalogue lists it under Training, but it is a way of running any live screen on data that is not real. Interface already has the banner rule for it. It needs every live module's cooperation and none of Training's tables | Interface and Foundations, as a platform capability. Settled by integration: it is out of Training, and a later story for Interface with Foundations |
| Deciding what a shift, a till or a booking requires | The host module owns its own records and attaches requirements to them | Front of house, Bar and Spaces, and an inventory module once one is specified |
| Blocking, warning or overriding when a requirement is not met | Training gives a verdict with a reason. The host decides what the verdict does | The host module |
| Hosting course material | A step links to a content page, a file in core's file store, or an address. Training is not a learning platform: no video hosting, no SCORM | The theatre's own pages and core files |
| Quizzes and assessments | A form does this. Training offers a form slot on a step and an outcome action that signs the step off | Form builder |
| Room booking for a session | A session names a core space and reports itself busy there. Approvals and policy are not Training's | Spaces |
| Paid courses | No course takes money in this specification | A later release, through Payments |
| Volunteer hours | Recorded from worked shifts | Front of house |
| Cross-module reports | Training exports its own lists and offers read services | Reports |
| Criminal-record check results | The platform records that a check was seen, when and by whom. It never stores the certificate, its number or its content (question 3) | Nowhere |

## The first release of this module

The module arrives after the box office, in roadmap phase 5 (NNT parity). Within the module, the first release is courses, steps, sign-offs, training records with expiry, competencies, requirements, sessions with attendance, and certificates. Later: the form-based knowledge check, automatic sign-off from another module's activity, self-booked renewal reminders with one-tap sign-up, bulk import, and sessions open to people who are not yet members.

## Dependencies

| Kind | Module | For |
| --- | --- | --- |
| requires | `forms` | Questions at sign-up and the knowledge check. Forms is always on, so this costs nothing |
| uses | `front-of-house`, `bar`, `spaces`. An inventory module is intended to join them, attaching training requirements to borrowing kit. Its id is added here when its specification is accepted, which is when Foundations reserves the id | Only so presets may suggest requirement and ability mappings. Training never calls them |

Training needs nothing but the core to do its whole job. No module lists Training in `requires`: every host reaches it through the point `core.requirement` or through its two facts, `training.competent` and `training.course-trainer`, and all three read correctly as empty when Training is off.

## Glossary

Training owns these words. Integration accepted "course", "training record" in full, "place" and "session waiting list" into the shared glossary.

| Word | Meaning |
| --- | --- |
| Course | One thing the theatre teaches, such as "Till" or "Fire marshal". The catalogue said "training module"; this specification never does, because "module" is Foundations' word |
| Course version | A numbered state of a course's steps and material. One version is live at a time |
| Step | One thing a person must do to complete a course version. Its kind is session, practical, reading or certificate |
| Sign-off | One step confirmed for one person. It records who confirmed it and how |
| Void | A later entry that cancels a sign-off made in error. The sign-off itself is never edited |
| Training record | The fact that a person completed a course, with the date it was awarded and the date it expires. Always written in full, never "record" alone, because "record type" is Foundations' |
| Current | A training record that is neither revoked nor superseded and whose expiry date has not passed. The only state that satisfies anything |
| Lapsed | A training record whose expiry date has passed. Read from the date; nothing is written when it happens |
| Cut short | A training record whose expiry date was brought forward because the course's material changed |
| Revoked | A training record withdrawn by a person with authority, with a reason. Immediate |
| Superseded | A training record replaced by a newer one for the same person and course |
| Renewal | Completing a course again while the old training record is current or recently lapsed. Only the steps marked for renewal are needed |
| Evidence | A certificate or other proof issued outside the theatre, attached to a certificate step, with its issuer and its own expiry date |
| Verified | Evidence a person with authority has looked at and accepted. Unverified evidence signs nothing off |
| Competency | A named thing a person may be trusted to do. Held while the person has a current training record for every course it lists |
| Requirement | A competency attached by another module to one of its own records, checked at a stated moment |
| Verdict | The answer to a requirement: met or not, until when, and if not, why and what would meet it |
| Trainer | A person who may run sessions and sign off steps for a course. Named on the course's list of trainers; not a role and not a kind of account |
| Session | A dated occasion on which a course's session steps are delivered |
| Place | One person's position on a session: booked, waiting, cancelled, attended or absent. Never "booking", which is Box office's and Spaces' word |
| Waiting list | Places in the waiting state, in order of joining. Qualified as "session waiting list" beside Box office's |
| Progress | A person's sign-offs towards a course they have not yet completed |

Words used from others, with their owners' meanings: account, unclaimed account, standing, side, grant, scope (Identity); space, vocabulary, term, file slot, notification (Core domain); form slot, outcome action, response (Form builder); module, fact, point, ability, record type, setting, unit of work, refusal (Foundations).
