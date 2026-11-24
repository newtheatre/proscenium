# Practice mode: specification

Nov 23, 2026 · @Matthew Adcock

Practice mode lets anyone learning a job run the theatre's real live screens (the desk, the door, the till) on a throwaway copy of the theatre, with sample people and a sample show tonight. It is marked on every screen, and nothing it does is written to the real database, sent, charged, posted to the ledger or counted in a figure.

It is a platform capability, not a module: the kit swaps the request's bindings for a per-person practice store, and each module contributes the scenarios and sample records for its own screens. It adds **no table to the real database** and needs no second D1 database.

## Why now

Interface's UI-29 promised it ("uses sample data, is marked on every screen, and writes nothing real") and the paper's catalogue listed it under Training; Integration moved it out of Training on 16 November 2026 because it needs none of Training's tables. The third round's map pairs it with Training's new online lessons: a lesson can say "Try it in practice" and open the real door screen on sample data. At NNT that replaces training new box office volunteers on a real show night, when a mistake is a real refund.

## Decisions (Matt, 24 November 2026)

1. **Each person gets their own throwaway practice store**: a Durable Object whose SQLite holds the full schema, a copy of the theatre's configuration and the scenario's sample records, deleted when the session ends (question 1, as recommended).
2. **The kit swaps bindings, modules do not branch.** For a request marked as practice the kit hands every module the practice store as `DB`, and practice stand-ins for files, cache, queues, email and realtime. A module's code runs unchanged.
3. **Fail closed.** No outside call leaves a practice request: payment readers, email, webhooks and sign-in providers answer from the module's declared practice answer or are refused. A change sent from a practice page without the practice mark is refused rather than written for real.
4. **The theatre's own configuration, never its people** (question 2, as recommended). The copy brings venues, ticket types, prices, products and settings, by each table's declaration, and passes every personal, free-text and special column through that column's own erasure rule.
5. **Every live screen can be practised from the first release** (question 5, Matt's choice). Each module with a live screen contributes a scenario, and the build refuses a page under `/live` that no scenario covers.
6. **Practice is reached only through a Training course** (question 3, Matt's choice). A person may practise a scenario while a course they are on, or hold a current record for, or train on includes a lesson section naming it. Training answers this as the fact `training.practice-open`; administrators may open any scenario to check it.
7. **Finishing counts towards Training later, switchable, off by default** (question 4, as recommended): the event `core.practice.scenario-completed` is a later story and the only real write practice would make.
8. **Confirm-it's-you steps are a clearly labelled pretend prompt** (question 6), and the feature is called **Practice** everywhere (question 7).

## At a glance

|  |  |
| --- | --- |
| Kind | Platform capability: kit (Foundations) plus frame (Interface), with contributions from each module that has live screens |
| Real tables | None. Four tables exist only inside a practice store |
| Points declared | `core.practice-scenario`, `core.practice-sample`; a `practice` answer on `defineCall` and a `practice` option on `defineTable` |
| Ability | `core.practice.use` (through a Training course, by the fact `training.practice-open`), `core.practice.manage` (administrator) |
| Address prefix | `/practice` (new reserved prefix) |
| Stories | PM-01 to PM-26: 1 gate, 19 first release, 6 later |
| Supersedes | Interface UI-29, which now points here |

## How it works

_[Diagram: how a request becomes practice · one code path, two sets of bindings]_

A practice tab sends a mark with every request. The kit, not the module, chooses the bindings, so the door screen's own code runs unchanged against the practice store. Parts 2 and 3 give the store and the rules; part 4 lists what each module contributes.

## How this document is laid out

The nine parts of the first round, then Sources. Part 4 doubles as the change list for Foundations, Interface, Identity, Payments, Box office and Training, because practice mode is mostly a set of small obligations on them.
