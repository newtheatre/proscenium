# Training (amended): specification

Nov 23, 2026 · @Matthew Adcock

Training now keeps **what is recorded** apart from **how it was learnt**. Other modules still ask one question, "does this person hold this competency at this instant?", but a competency can now be earned by any of several **routes**, and a course can be delivered in person, online with a lesson and a quiz, on shift, or by declaring experience gained elsewhere for somebody to approve. This amends the second-round Training records specification of 16 November 2026 (`docs/specs/training-records`, accepted in full by Matt). Nothing in Training is built yet, so every change lands in the specification before the first line of code, with no data to move.

*[Drawing: recorded, earned, taught · one competency, three routes, four ways to learn]*

The host sees only the competency and its verdict. Which route Sam took, and how the course was taught, is Training's business.

## The amendment in eight lines

1. A **competency** is still the one thing other modules require. Its verdict, facts and the `core.requirement` contract are unchanged.
2. A competency now has one or more **routes**. Holding any one route holds the competency. A route is a short list of **items**, all of which must hold: a current training record for a course, or a requirement recognised from somewhere else.
3. **Recognised elsewhere** is a route item, not a step. It names another source's `core.requirement` reference (such as a membership scheme or a fact) and is checked live at the instant asked, so nothing is copied and nothing goes stale.
4. A **course** is still versioned steps, and still knows nothing of the competencies that use it. The step kinds grow from four to eight: session, practical, **activity (shadowed shifts first)**, reading, **online lesson**, **quiz**, certificate and **declaration**.
5. An **online lesson** is a short page sequence written in the app, with video in core's one video player (C-64), from an allowed host or uploaded to the theatre's own Cloudflare Stream, and optional practice-mode scenarios (the only way into practice mode). Progress is saved per section; reaching the end signs the step off.
6. A **quiz** is a form-builder form with correct answers and a pass mark (FB-513). Training hosts it through its own slot, so the mark and the sign-off are one unit of work, with no hand marking and no automatic transition.
7. A **declaration** is experience gained elsewhere, stated by the person with optional evidence, and approved by somebody who is not them. It shares the certificate's table, queue and rules, so there is one queue of "evidence to check".
8. A **shadowed shift** is brought forward from later (TR-28): Front of house reports shifts worked alongside a lead who confirmed it (FH-51), and Training signs the step off once per shift.

## What does not change

The training record per course, its expiry read from the date, renewal, versions and "retraining required", sessions with places and a waiting list, direct award, revocation, the two facts, the requirement contract, the abilities and every privacy rule. Matt's ten rulings of 16 November 2026 all stand. One is extended: "competencies, not courses" now also means "routes, not a fixed list of courses".

## What it relies on from this round

| Relied on | Owner | Status |
| --- | --- | --- |
| FB-513: correct answers, points, feedback and a pass mark, with `addResponse` returning the marking | Festival-ready changes (spec 15) | Agreed on 23 November 2026 |
| FB-515: a quiz template | Festival-ready changes | Agreed; optional for Training |
| FH-51: Front of house's contribution `front-of-house.shadowed-shift` to `training.step-source`, and the event `front-of-house.shadow.confirmed` | Festival-ready changes | Agreed |
| `core.practice-scenario`, `/practice/<scenario id>` and, later, `core.practice.scenario-completed` | Practice mode (spec 13) | Agreed |
| `core.measure`, the figures point | Reports (spec 12) | Agreed |
| Training requirements on kit, through `training:tcmp_…` references | Inventory (spec 11) | Told; nothing new needed |

## Size

| | Before | After |
| --- | --- | --- |
| Tables | 12 | 17 (one removed, six added) |
| Id prefixes | 9 | 13 (tvid, `trte`, `tlsc`, `tqat`) |
| Step kinds | 4 | 8 |
| Sign-off kinds | 6 | 8 |
| Settings | 17 | 24 |
| Abilities | 14 | 14 |
| Form slots | 2 | 3 (`training.knowledge-check` withdrawn) |
| Outcome actions | 1 | 0 (`training.sign-off-step` withdrawn) |
| Stories | 34 | 58 (TR-35 to TR-58; TR-27 withdrawn, TR-28 brought forward) |

Tabs 1 to 9 follow the first round's nine parts and say only what is new or changed; anything not mentioned stands as written in the repository's `docs/specs/training-records`. Matt answered all nine questions in tab 9 on 24 November 2026: eight as recommended, and question 4 adds uploads to Cloudflare Stream.
