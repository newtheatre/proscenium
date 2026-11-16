# 1. Scope

## What foundations is

Foundations is the part of Proscenium that every module stands on and that no theatre ever switches off. It owns four things: **where code lives** (the repository layout and who owns each path), **how a module declares itself** (the manifest and the three registries), **how work is done safely** (the kit: unit of work, routes, events, jobs, tasks, credentials, audit) and **how the product is kept healthy** (migrations, updates from upstream, health checks, tests and CI).

It lives in the one always-on module, `core`. Identity, the core domain and the interface are other areas of the same module, specified by workstreams 2, 3 and 6.

## In scope

| Area | What this specification settles |
| --- | --- |
| Repository | The layout, which paths upstream owns and which the theatre owns, how a theatre overrides or adds without touching upstream's files, and the check that keeps it so |
| Module manifest | The `defineModule` format, naming rules, what happens when a module is switched on or off, and how one module may use another |
| Settings registry | Kinds, limits, audience, live quoting on public pages, change history |
| Abilities registry | Abilities, record types, ownership, facts, risk levels, and the one place a permission is checked |
| Data-class registry | The class of every column, what erasure does to it, retention, append-only tables, the subject of a row |
| The kit | Unit of work, route wrapper, events, jobs, scheduled tasks, external calls, credentials, audit, idempotency, rate limits, refusals |
| Migrations | How schema changes are generated, ordered, applied and recorded, for upstream and for a theatre's own modules |
| Updates | How a theatre receives an upstream release: the branch model, the update action, the lockfile, release channels, what a breaking change is |
| Setup and health | First-run setup, the health screen, missing secrets, dead-lettered jobs |
| Tests and CI | The three tiers, the conformance checks every module must pass, the CI workflow, local runs |
| Console screens | Setup, Modules, Settings, Jobs, Credentials, Updates and health, Audit |

## Out of scope, and who owns it

| Not here | Owner |
| --- | --- |
| Accounts, sign-in, roles, grants, erasure and export requests as a user flow | Workstream 2 (identity). Foundations supplies the registries those flows read. |
| Seasons, productions, performances, venues, files, notifications, branding | Workstream 3 (core domain) |
| Tickets, orders, money | Workstream 4 (box office) |
| The form builder | Workstream 5 |
| Shells, navigation, components, the design system | Workstream 6 (interface). Foundations supplies only the rule for where published components live. |
| What any individual setting or ability means | The module that declares it |

## Principles this part holds every module to

1. **Declared, not discovered.** Anything another part of the system needs to know about a module (its tables, settings, abilities, events, secrets) is in its manifest, and CI fails when the code and the manifest disagree.
2. **Features and conventions are separate.** A module supplies a feature. A theatre's way of working is settings, vocabularies, presets and forms, never a code path. Nothing in `core` names a theatre.
3. **One way to do each dangerous thing.** One function checks permission, one object writes to the database, one wrapper defines a route, one function calls an outside service.
4. **A module can be switched off without breaking another.** Dependencies are declared and of two strengths, and a soft dependency must work when the other module is off.
5. **The theatre never edits upstream's files.** Every customisation has a place under `site/`, and a check enforces it.
6. **A successor can pick it up cold.** Names say what things are, refusals say what to do next, and the health screen shows what is wrong in plain words.

## Decisions inherited from the design paper

Single-tenant, one Worker, one D1 database, AGPL-3.0, forked whole and merged from upstream, Workers Paid assumed, the name stays Proscenium. This specification does not reopen them.
