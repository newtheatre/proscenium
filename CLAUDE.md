# Proscenium

A free, open-source theatre management platform that runs entirely on Cloudflare (one Worker, one D1
database, R2, KV, Queues). Nuxt 4 and Nuxt UI 4, TypeScript, Bun. Each module is a Nuxt layer in
`layers/<id>/`, built with the kit in `layers/core/kit` (imported as `#kit`). A theatre forks the repo
and adds its own pages and `x-` modules under `site/`.

This file is the short list. The detail lives in:

- [docs/kit/README.md](docs/kit/README.md): modules, tables, routes, the unit of work, jobs, settings.
- [docs/kit/interface.md](docs/kit/interface.md): page types, kit components, forms, lists, dates, money.
- [CONTRIBUTING.md](CONTRIBUTING.md): process, code standards, components, testing, writing.
- `docs/specs/<module>/`: the specification for each module. `docs/design-paper/08-decisions.md`: decisions.

## Rules that are never broken

- **Bun only.** `bun install`, `bun run <script>`, `bunx`. Never npm, pnpm or yarn.
- **Branch from `next`, PR into `next`.** Name branches `feat/<module>-<slice>` or `fix/<what>`.
  `main` holds tagged releases only.
- **Spec, then failing tests, then the code, then the docs, in one PR.** Every change traces to a
  spec in `docs/specs/` or a decision. Documentation that falls behind behaviour is a defect.
- **Never edit generated files:** `.generated/`, `.nuxt/`, `.output/`, or a migration that has been
  released. Change the manifest or schema and run `bun run generate` or `bun run db:generate`.
- **Money is integer minor units (pence)** until it is formatted with `useMoneyText()`. Card data
  never touches our code: payments go through a payment provider or a card machine.
- **Dates are in the theatre's time zone** (`core.locale.time-zone`); the show day starts at
  `core.locale.day-start` (04:00). Use `today()`, `localDate()` and `useDates()`, never `new Date()`
  arithmetic or a hand-made `Intl` formatter.
- **Policy numbers are settings**, never literals (the conformance check refuses them; mark a
  genuine constant with `// not-policy: why`).
- **One D1 database; a change commits through the kit's unit of work** (one batch: change, audit,
  events, jobs). A contended row is guarded with `unit.add(...).expect(n)`. A fan-out is written
  set-wise with `insertSet`, never one statement per row.
- **A module imports another only through `#modules/<id>`** (its `server/services.ts`), and only if
  it lists that module in `requires`.
- **Never write to the production database. Never deploy.** Workers Builds deploys `nnt`; people
  decide when.
- **No secrets** in code, config, fixtures, tests or docs.
- **Writing:** British English in UI copy and docs; no em dashes anywhere; every user-facing string
  goes through `t()` with a key in the module's `i18n/en-GB.json`.
- **Attribution:** commits use the submitter's identity. No references to AI assistants or tools in
  code, comments, commits, PRs or docs, and no generated-by or co-author trailers.

## Components and code: what good looks like here

The kit already has a component for most things. Reach for it before writing markup.

1. **Kit component first, then Nuxt UI, then a new component.** Page types are `PageList`,
   `PageForm`, `PageSettings`, `PageRecord`, `PageSteps`, `PageHome` and `PageLive`, all inside
   `PageFrame`. Inside a page: `PageSection`, `RecordList`/`RecordListItem`, `TableOrList`,
   `FactStrip`, `FieldGroup`, `EmptyState`, `IconButton`, `RowActions`, `PageActions`, `SidePanel`,
   and the `Field*` controls. The full list is in `layers/core/app/components/` and described in
   `docs/kit/interface.md`. Use the Nuxt UI MCP server or skill for Nuxt UI components.
2. **A component does one job.** Split a `.vue` file when it passes about 300 lines, when its
   template has a block you could name ("the basket", "the payment step"), or when two screens
   would otherwise copy the same markup. Name the part for what it is (`TillBasket.vue`), prefixed
   with the module (`BoxOffice…`, `Bar…`).
3. **Logic goes in composables, not templates.** State and behaviour that a screen owns go in
   `app/composables/use<Thing>.ts`; pure functions go in `app/utils/` or `shared/`. A component's
   `<script setup>` wires props, a composable and events together; it should read in a minute.
4. **Typed contracts.** `defineProps<{...}>()` and `defineEmits<{...}>()` with types, `v-model` via
   `defineModel`. No `any`; validate request bodies with zod and infer the type from the schema
   (`z.infer`) instead of casting `parsed.data as X`.
5. **Share across modules through the kit.** If two modules need the same part (a buyer picker, a
   receipt box), it belongs in `layers/core/app/components/` with a neutral name, not copied.
6. **Server code: small functions, one level of abstraction.** A route validates, calls a service
   function and returns. Keep functions under about 80 lines and a cyclomatic complexity of 15; a
   long `if` chain over kinds becomes a table of handlers. More than four parameters becomes an
   options object.
7. **No import cycles.** If two files need each other, move the shared part into a third file.
8. **Delete, do not comment out.** No unused exports, files or dependencies.

`bun run check:conformance` enforces many of these ("Screens are built from the kit"). When a
review finds a new pattern to avoid, add it to `scripts/checks/` with a message that says what to do.

## Commands and how long they take

| Command | What it does | Time |
| --- | --- | --- |
| `bun install` | Install, generate the registry, `nuxt prepare` | 15 s |
| `bun run check:changed` | ESLint (cached) and related unit tests for files changed against `origin/next`, then conformance | 10 to 30 s |
| `bun run lint` | ESLint, whole repo | 45 s |
| `bun run typecheck` | Nuxt and test types | 85 s |
| `bun run check:conformance` | The repo's own rules | 8 s |
| `bun run check` | lint, typecheck and conformance | 2 to 3 min |
| `bun run metrics` | Import cycles, duplication, type coverage and ignore comments against `metrics.json` | 2 min |
| `bun run lint:prune` | Shrink `eslint-suppressions.json` after fixing a listed place | 45 s |
| `bun run check:unused` | Knip: files and dependencies nothing uses | 20 s |
| `bun run test:unit` | Unit tests (Node) | 20 s |
| `bun run test:integration` | Integration tests in workerd with a local D1 | 9 min |
| `bun run test:browser` | Build, then Playwright with axe | 5+ min |
| `bun run db:generate -- --name <what>` | Write a migration after a schema change | |

Use `check:changed` after each edit, `check` before pushing, and let CI run the integration and
browser tiers: push the branch and read its result. Run one integration file with
`bunx vitest run --project integration <path>`.

## Where things go

```
layers/<id>/module.ts                  The manifest: defineModule({ id, requires, settings, ... })
layers/<id>/server/db/schema.ts        Tables (defineTable, col.*)
layers/<id>/server/api/<id>/...        Routes (defineRoute)
layers/<id>/server/services.ts         What other modules may import as #modules/<id>
layers/<id>/app/pages|components|composables
layers/<id>/i18n/en-GB.json            Every label and message
layers/<id>/tests/unit|integration     Tests beside the module
tests/fixtures/modules/                Fixture modules for kit tests
tests/e2e/                             Browser tests (the gallery build)
```

## Before you say it is done

- `bun run check:changed` is clean, and `bun run check` passed before the push.
- New behaviour has a test that failed before the change.
- Docs and the module's spec match what the code now does.
- The PR uses the template and says which spec or decision it implements.

## Agent tooling in this repo

- `.claude/settings.json` hooks: generated files, released migrations and the lockfile cannot be
  edited; npm, deploys, remote D1 writes and force-pushes to shared branches are refused; each edited
  file is linted and fixed; and `check:changed` runs before an agent may finish.
- `.mcp.json`: the Nuxt, Nuxt UI and Cloudflare documentation servers, and Playwright for driving
  the built site. Prefer them to memory for any framework question.
