# Training records: specification

> Amended by [`docs/specs/training/`](../training/), the third-round specification, which supersedes this folder where they differ.

Nov 16, 2026 · @Matthew Adcock

Training is a switchable module, id `training`, that records who has been trained in what, by whom and until when, and lets any other module require that training without knowing Training exists. This is its second-round specification, with every ruling of 16 November 2026 folded in, in the nine parts of the first six, one per tab.

## The design in eight lines

1. A **course** is what a theatre teaches. It has numbered **versions**, and each version has one or more **steps**: attend a session, be signed off on a practical, confirm some reading, or show a certificate.
2. A **sign-off** is one step confirmed for one person, by a trainer, by attendance, by the person or by a verified certificate. Sign-offs are append-only.
3. A **training record** is awarded, in the same write as the last sign-off, when every step of the course is signed off. It runs until its expiry date, which the course sets.
4. Expiry is read from the date, never written. A daily task only sends warnings and announces the lapse.
5. Publishing a new course version either leaves training records standing or cuts them short after a grace period, at the author's choice.
6. A **competency** is a named thing a person may be trusted to do, such as "Till operator". It is held while the person has a current training record for every course it lists. Other modules require competencies, never courses.
7. Other modules reach Training in two ways: a requirement they attach to their own records and check at a stated moment, and the fact `training.competent`, which a theatre can map abilities to. A second fact, `training.course-trainer`, is how a course's trainers get their authority.
8. **Sessions** have capacity, sign-up, a waiting list and attendance. The last place is taken once, by the mechanism Box office proved.

## What Training relies on in other workstreams

| Relied on | Owner | Where |
| --- | --- | --- |
| The shared point `core.requirement`, through which a host module requires training (or membership, or anything else) by a soft link | Foundations | Tab 4 |
| A fact mapping pinned to one record, so abilities can follow one competency or one course's trainers | Foundations for the format, Identity for the table and the screen | Tabs 4 and 6 |
| Nine id prefixes, registered | Foundations | Tab 2 |
| Identity's fifteen preset roles, which receive Training's abilities. Training adds none | Identity | Tab 6 |
| `core.space-busy` and `isSpaceFree`, so a session shows on the room calendar and never bumps a booking | Spaces | Tabs 3 and 4 |
| The glossary words "course", "training record", "place" and "session waiting list" | Integration | Tab 1 |
| The teaching screens' place in the members' area | Interface | Tab 5 |

Practice mode, which the catalogue listed under Training, is not in this module. It is a later story for Interface with Foundations.

## Size

12 tables, 4 record types, 2 facts, 14 abilities, 17 settings, 34 stories (24 for the module's first release, 10 later) and 10 questions in tab 9, all answered by Matt on 16 November 2026. Tabs 2, 3 and 4 each open with a diagram, and tab 5 has four wireframes.

## Sources

Read on 16 November 2026: [Foundations formats](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x) (Formats and its sub-tabs, part 4), [Interface conventions](https://claude.ai/artifact/KwZ3oXcFJSMNj98kNc9ywW) (Page conventions), [Identity](https://claude.ai/artifact/BcVS8iNe7oDZCPmW4gyus5) (part 4), [Form builder](https://claude.ai/artifact/6E5k2VS2PnhdciVNMeap5s) (part 4) and the [design paper](https://claude.ai/artifact/8Yn8fPcsngaKVrTdijBaiD) (Module catalogue; Build backlog and glossary). No other theatre's training practice was researched; the model generalises what the catalogue lists and what Front of house's eligibility example needs.
