# Unified system: documentation

This directory is the definition package for the unified theatre management system: the single
application that replaces stage-door, proscenium, rooms and rehearsal. The gate at the bottom of
`roadmap.md`'s Phase 0 passed on 26 August 2026 (decision 0019) and development has started.

## Contents

| File | What it is |
| --- | --- |
| `roadmap.md` | The compressed delivery plan: cutover by 31 October 2026, hardening to December, V2 from January. Phases, gates and the conditions the dates depend on. |
| `backlog/` | The full story backlog, one file per module, tracker-ready. Each story has a role, a testable acceptance list, a phase and its sources. |
| `decisions/` | Foundational architecture decision records, all accepted at the gate on 26 August 2026. |
| `workshops.md` | The configuration defaults register: every number that is currently folklore, with a proposed value for the committee to confirm, plus the workshop agenda. The proposed values are what the system ships until a workshop amends them (0019). |
| `architecture.md` | How the running system is put together: runtime, code layout, identity, concurrency, scheduled tasks, deployment and testing. |
| `data-model.md` | Every table, its columns and the rules the schema enforces. |
| `operations.md` | What an operator does: deploys, migrations and their restore point, the health check, the first administrator, secrets. |
| `design-language.md` | The reasoning behind the tokens, the two intensities, and the rules for using them. |
| `spikes.md` | Time-boxed investigations that must land before their dependent build work. |
|  `../CONTRIBUTING.md` | Engineering standards, at the repository root as CONTRIBUTING.md. |

## How to review

1. Read `roadmap.md` first; it frames everything else.
2. Review `decisions/` in numeric order; each records its options and a recommendation.
3. Sample the backlog for your area rather than reading all of it in one sitting; the per-file
   summaries state counts and open questions.
4. Bring disagreements to the workshop sessions in `workshops.md`; the register there is the
   list of things that need a human decision.

## Provenance

The backlog derives from three companion documents: the functional audit of the existing four
applications, the greenfield specification, and the migration plan. Constraints registered by the
committee on 26 August 2026 bind throughout: payment only via the SU's SumUp flows, Google
sign-in restricted to the Workspace, general admission as the core seating model, serving-size
variants at the bar, training delivery modes, and the production module deferred until the
operational core is trusted.
