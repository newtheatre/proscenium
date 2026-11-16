# 7. Stories

Training has 34 stories, TR-01 to TR-34: 24 for the module's first release and 10 later. None is a gate story for another workstream, because nothing upstream requires Training. The whole module sits in roadmap phase 5, after the box office and the form builder.

Each story is done when its acceptance line holds and the tests named in part 8 pass. Rule numbers are part 3's; screen numbers are part 5's.

## Order of work

| Order | Stories | What it gives | Rests on |
| --- | --- | --- | --- |
| 1 | TR-01 to TR-04 | A course exists, is published and has trainers | The kit; Identity's roles and fact mappings; Interface's List, Record and Form pages |
| 2 | TR-05 to TR-08 | A person is signed off, awarded a training record and can see it | Order 1 |
| 3 | TR-22, TR-23 | Competencies, and the answer other modules ask for | Order 2; the kit's `requirements` helpers |
| 4 | TR-09 to TR-14 | Sessions, places and attendance | Order 2; core spaces and notifications |
| 5 | TR-16 to TR-21 | Expiry, renewal, versions, revocation, direct award, evidence | Order 2; core files for evidence |
| 6 | TR-15, TR-24 | Privacy duties and oversight | Everything above |

Order 3 comes early on purpose. Front of house, Bar and Spaces can be built against real verdicts as soon as it lands, with training records made by sign-off alone.

## First release

| Id | As | I want | So that | Done when | Rules, screens |
| --- | --- | --- | --- | --- | --- |
| TR-01 | a theatre's owner | to switch Training on and off | I only run what I use | The manifest, 12 tables and their migration exist; off answers 404, grants nothing and keeps every row; on restores every answer | T2 |
| TR-02 | a training manager | to create a course with its steps and validity | the theatre's training is written down once | A course in preparation can be saved with one to twenty steps of the four kinds; a validity shorter than the warning period is refused | V1; K1, K2 |
| TR-03 | a training manager | to publish a course | members can see and take it | Version 1 goes live in one write; the course appears in M2 and M3 for holders of `training.course.view`; a published version cannot be edited | V2; M2, M3 |
| TR-04 | a training manager | to say who can train a course | sign-offs come from people I trust | The Trainers tab adds and removes the course's trainers in `training_course_trainers`, needing `training.course.manage` and no grant through Identity; the fact `training.course-trainer` gives a trainer the mapped abilities at that course only; a trainer sees only their courses in M7 and M9 | K2 |
| TR-05 | a trainer | to sign somebody off on a practical step from my phone | their progress is recorded where it happens | One tap writes a sign-off for a chosen day with Undo; a step needing two shows 1 of 2; signing myself off is refused with its reason | S1, S2, S4; M9 |
| TR-06 | a learner | my training record to appear the moment my last step is signed | I am not waiting for an administrator | The training record, audit entry, event and notification are in the same batch as the last sign-off; its expiry is the end of the right day | A1 to A5 |
| TR-07 | a member | to see what I hold, what is lapsing and what I am part-way through | I know where I stand | M1 orders cards by urgency; M5 and the My account section list every training record with a status word | L4; M1, M5 |
| TR-08 | a learner | to confirm I have read a reading step | online material counts | Confirming writes a self sign-off only after the material was opened in the session | S1; M3 |
| TR-09 | a training manager or trainer | to schedule a session in a space | people can come | A published session shows in M3 and M4; the space shows busy through `core.space-busy`; a space with future sessions cannot be deleted | K3, K4 |
| TR-10 | a member | to sign up for a session, or wait if it is full | I get a place fairly | Two simultaneous sign-ups for the last place give one place and one offer of the waiting list; freeing a place promotes the first waiting person and tells them, in one unit | P1 to P4; M4 |
| TR-11 | a member | to cancel my place in time | somebody else can have it | Cancelling before the deadline frees the place; after it the screen names the trainer to tell | P3; M4 |
| TR-12 | a trainer | to add a person to a session, with or without an account | nobody is turned away for paperwork | Adding by name makes or finds an account through `findOrCreateAccount` and gives a place if capacity allows | P1, P7; K4, M8 |
| TR-13 | a trainer | to mark who came and close the session | attendance becomes sign-offs | Marking attended writes the session steps' sign-offs and may award a training record in the same unit; changing a mark voids them; closing needs every place marked; I cannot mark myself | S6, P7, P8; M8 |
| TR-14 | a person with a place | to be told when a session changes, is cancelled or is tomorrow | I turn up at the right time or not at all | Change and cancellation notices cannot be switched off; the reminder can; each is sent once | P5, P9 |
| TR-15 | a person | my training data to follow the platform's privacy rules | my rights do not depend on the module | Download holds my places, sign-offs, training records and evidence files; erasure deletes evidence and redacts notes; a merge moves no row, leaves one place per session, and reads both accounts' training records as one person's; retention anonymises on the due date | Part 2 |
| TR-16 | a member | to be warned before my training lapses | I can renew in time | One warning at the warning period, one notice at the lapse, a home card throughout; a lapsed training record stops meeting requirements at the date whether or not the task ran | L1, L3 |
| TR-17 | a member | renewing early to cost me nothing | I renew when a session suits | Completing the renewal steps inside the window runs the new validity from the old expiry; after the grace the full course is needed | A2, A3 |
| TR-18 | a training manager | to publish a changed course and choose whether people must retrain | a safety change reaches everyone and a typing fix reaches nobody | Records-stand changes no training record; retraining-required cuts every holder's expiry to the grace date in one write, tells each one what changed, and lets them complete by the changed steps alone | V3 to V7; K2 |
| TR-19 | a training manager | to revoke a training record and to void a wrong sign-off | mistakes and concerns are dealt with openly | Revocation needs a code and a note and takes effect on the next verdict; a void is a second row; both are audited; neither can be done to oneself's benefit | L2, S5; K6 |
| TR-20 | a training manager | to award a training record directly | training done before the platform counts | A reason and an expiry within the course's validity are required; never to myself | A6; K6 |
| TR-21 | a member | to send in my first-aid certificate, and a verifier to check it | outside training counts once somebody has looked | Submitted evidence signs nothing off; verifying writes the sign-off and may award; a step that forbids files accepts only a seen-only entry; nobody verifies their own | E1 to E4; M6, K9 |
| TR-22 | a training manager | to define competencies from courses | other modules ask for "Duty manager", not a list of courses | A competency is active only with a course; changing its courses shows holders before and after | C1, C5; K8 |
| TR-23 | another module | to ask whether a person holds a competency at a given instant | a rota or a till can require training without knowing Training | The `core.requirement` source lists active competencies and answers `met` and `not-met` with a reason, for now, a future instant and a past one; the fact `training.competent` answers the same question for now | C1 to C4, C6 |
| TR-24 | a training manager | to see and export who holds what | I can plan sessions and answer for the theatre | K5 filters by competency, course, status and lapsing-within, exports what is filtered, and audits the read; K6 shows one person | K5, K6 |

## Later

| Id | Story | Why later |
| --- | --- | --- |
| TR-25 | The matrix of people against competencies (K7) | K5 does the job as a list; the grid needs a full-width layout and its own accessibility work |
| TR-26 | A weekly digest for training managers | Home cards cover it at first |
| TR-27 | A knowledge check: a form on a reading step whose approval signs the step off | Needs the form builder's outcome actions in use elsewhere first |
| TR-28 | The point `training.step-source`, so a shadowed shift can sign off a practical step | Needs Front of house built |
| TR-29 | Import training records from a spreadsheet | Direct award covers a small theatre; an import needs a preview and an undo |
| TR-30 | Three example courses to copy during setup | Wording to be written with a real theatre |
| TR-31 | Marking attendance without a connection | Question 9 |
| TR-32 | Sessions open to people who are not yet members, listed on a public page | Question 2 |
| TR-33 | Questions at sign-up, through the form slot `training.session-signup` | The slot is declared in the first release; the screen work waits |
| TR-34 | Add a place to my calendar | Rests on core's calendar helper |

## What other workstreams' stories wait on these

Front of house's rota eligibility, Bar's till opening and Spaces' induction rule each wait on TR-23 and on the kit's `requirements` helpers, and each is written to work with no provider present.
