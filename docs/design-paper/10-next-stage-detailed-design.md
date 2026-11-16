# Next stage: detailed design

The next stage turns this paper into specifications detailed enough to build from, written by several threads in parallel and reconciled by one. It produces documents and a few technical proofs, not product code. Nothing here has started; it waits for Matt's go-ahead.

"Phase 2" is read here as the second stage of this planning project. Phase 2 of the build roadmap (core domain and public site) is a different thing and is one of the workstreams below.

## The workstreams

Each is one thread, owns its own document, and stays out of the others' ground, as the Mailflare port's workstreams did.

| Workstream | Covers | Depends on |
| --- | --- | --- |
| 1. Foundations | Repository layout and owned paths, the module manifest, the settings, permission and data-class registries, the upstream-merge workflow, CI and the test harness | Nothing |
| 2. Identity and accounts | The account model, audience and members' experiences, sign-in, sessions, several addresses per person, roles and permissions, merge, erasure | 1 |
| 3. Core domain and public site | Seasons, productions, performances, venues, files, notifications; content structure and public components; branding | 1 |
| 4. Box office, payments and ledger | Tickets, pricing, holds, capacity, desk and online sales, refunds, passes, door scanning; the provider interface; the ledger | 2, 3 |
| 5. Form builder | The form definition, the logic engine, versioning, workflows, the builder's interface | 1, 2 |
| 6. Interface and design language | The three shells, navigation, the page and list conventions, key journeys drawn as wireframes, accessibility rules | 2 |
| 7. Integration (this thread) | Shared glossary and data model, conflicts between specifications, the build backlog and order | All |

Front of house, Spaces, Bar, Training, Membership and Communications are specified in a later round, once the first six have settled the patterns they will reuse.

## What each specification contains

Every workstream delivers the same nine parts, so they can be read and compared quickly.

1. **Scope:** what is in, what is out, and what it assumes of other workstreams.
2. **Data model:** every table and column with its type, constraints, data class and erasure behaviour.
3. **States and rules:** each record's life cycle drawn as a diagram, with the rule that guards each change.
4. **Interface to other modules:** the services it offers, the events it announces and the ones it listens for.
5. **Screens:** an inventory of every screen with its purpose, who sees it, and wireframes for the important ones.
6. **Settings and abilities:** each one it registers, with defaults and who may change it.
7. **Stories:** a backlog with testable acceptance criteria, ordered into a first release and later.
8. **Test plan:** the named cases that must never regress, such as the last seat selling once.
9. **Questions for Matt:** each with options and a recommendation, as in the Decisions tab.

## Technical proofs

Four risks are cheaper to test than to argue about. Each is a small throwaway experiment with a written result.

| Proof | Question it answers | Workstream |
| --- | --- | --- |
| Owned paths | Can a fork override pages from a `site/` layer and merge an upstream release with no conflict? | 1 |
| One-step deploy | Can a deploy button create the Worker, database, bucket, queues and Durable Object for a fork? | 1 |
| Local tests | Do unit, integration and browser tests run on Windows, macOS and Linux against the real Workers runtime and D1? | 1 |
| Last seat | Does a capacity constraint on D1 hold under concurrent purchases, with and without allocated seats? | 4 |

## How the threads work together

- **One document per workstream**, linked from this paper's Overview, in the same tabbed style.
- **Workstream 1 goes first.** Its manifest and registry formats are what the others write against, so it gets a short head start before the rest begin.
- **This thread integrates.** It keeps the glossary and the combined data model, reads every specification as it lands, and raises conflicts with the threads concerned.
- **Rules for every thread**, written once: British English, features and conventions kept apart, nothing based on modifying today's Proscenium, every claim about another system sourced.
- **A status board** in this paper shows each workstream's state and its open questions.
- **Fable 5.2** is used for every thread, as asked.

## What Matt is asked for

- A go-ahead to start, and any change to the list of workstreams.
- Answers to each specification's questions. Expect roughly five to ten per workstream, batched so they can be answered in one sitting.
- A read of the wireframes in workstream 6, which is where taste matters most.
- A decision at the end: whether the specifications are good enough to create the repository and start the build roadmap's phase 1.

## What this stage will not produce

- Product code, beyond the four proofs.
- Specifications for programming and production management, which stay last.
- A data migration design for NNT, which is not a concern.
- Dates. None have been set.

## What done looks like

- Six specifications, each complete on all nine parts and with no unanswered question.
- One combined data model with no table defined twice and no term used two ways.
- Four proofs with written results, and the paper updated where a proof changed a convention.
- A build backlog for the roadmap's phases 1 to 3, ready to become issues in the new repository.
