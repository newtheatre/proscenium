# Contributing

The engineering standards for Proscenium. [CLAUDE.md](CLAUDE.md) is the short list of rules; this
file explains them. The committee that runs a theatre turns over every year, so write code and
documentation a successor can pick up with nobody to ask.

## Process

- **Spec, then failing tests, then the implementation, then the docs**, in one pull request. Every
  change traces to a story in `docs/specs/<module>/` or a decision in
  `docs/design-paper/08-decisions.md`. A change with neither gets one first.
- **Small pull requests.** A PR a reviewer cannot read in twenty minutes is two PRs. A refactor and
  a behaviour change never share a PR.
- **Branches** come from `next` and are named `feat/<module>-<slice>` or `fix/<what>`. PRs go into
  `next`; `main` holds tagged releases.
- **CI is the test bench.** Lint, types and conformance run locally in a couple of minutes; the
  integration and browser tiers run on CI on Linux. Push and read the result rather than fighting a
  suite on your own machine.
- **Generated code merges only when its human owner understands it.** Money, capacity and security
  paths get tests first and a line-by-line review.

## Components

The kit (`layers/core/app/components/`, described in [docs/kit/interface.md](docs/kit/interface.md))
gives every screen the same frame, forms, lists, states and small parts. A screen built from it
looks and behaves like the rest of the site, is accessible, and is checked by the conformance run.

**Choosing a component, in order:**

1. A kit page type: `PageList`, `PageForm`, `PageSettings`, `PageRecord`, `PageSteps`, `PageHome`,
   `PageLive`, inside `PageFrame`.
2. A kit part: `PageSection`, `RecordList` and `RecordListItem`, `TableOrList`, `FactStrip`,
   `FieldGroup`, `FilterPanel`, `TabStrip`, `EmptyState`, `DataBoundary`, `IconButton`,
   `RowActions`, `PageActions`, `SidePanel`, `SortableList`, `StatusBadge`, `QrCode`, `ChartFigure`.
3. A kit field: `FieldDate`, `FieldDateRange`, `FieldDateTime`, `FieldMoney`, `FieldNumber`,
   `DurationInput`, `DefaultedNumber`, `FieldRecord`, `FieldColour`, `FieldCountry`, `PersonPicker`.
4. A Nuxt UI component (`UForm`, `UFormField`, `UTable`, `USelectMenu`, `UModal`, `USlideover`...).
5. Only then, a new component. If more than one module could use it, it goes in the kit with a
   neutral name and a section in `docs/kit/interface.md`.

**When to split a component.** A `.vue` file is doing too much when any of these is true:

- it passes about 300 lines (CI warns at 300 and fails new files over 400);
- its template has a block you could give a name to ("the basket", "the payment step", "the
  receipt box"): that block is a component;
- its `<script setup>` holds state and behaviour for several parts: that is a composable per part;
- another screen needs the same markup: that is a shared component, not a copy.

Name a module's components with its prefix (`BoxOfficeBasket.vue`, `BarStockRow.vue`) so Nuxt's
auto-import finds them and a reader knows where they live.

**Inside a component:**

- `defineProps<{ ... }>()`, `defineEmits<{ ... }>()` and `defineModel()` with types. Props down,
  events up; a child never reaches into its parent.
- State and behaviour live in `app/composables/use<Thing>.ts`; pure functions in `app/utils/` or
  `shared/`. The component's script wires props, a composable and events together.
- Call the API with `useAPI()` or `useNuxtApp().$api`, never the global `$fetch` or `useFetch`.
- Dates through `useDates()`, money through `useMoneyText()` and `FieldMoney`, words through `t()`.
- No inline styles. Tailwind utilities only where Nuxt UI's props and `ui` slots cannot say it.
- A button with an `async` handler takes `loading-auto`; a destructive action confirms with
  `useConfirm()` or offers `useUndo()`, never the browser's `confirm()`.

## Server code

- **A route is thin.** `defineRoute` declares its ability and input schema; the handler calls a
  service function and returns its result. Business rules live in the module's `server/` files.
- **Validate with zod and infer types from the schema** (`z.infer<typeof input>`). Do not cast
  `parsed.data as X`.
- **Small functions.** Aim for under 80 lines and a cyclomatic complexity under 15. A long `if` or
  `switch` over kinds becomes a record of handlers keyed by kind. More than four parameters becomes
  an options object.
- **No import cycles.** Two files that need each other share a third file holding the common types
  and helpers.
- **One unit of work per change**: the change, its audit entry, events and jobs commit together.
- **Lists paginate in SQL** and are declared once with `defineList`/`defineListSource`.
- **Customer-facing responses are column allow-listed.** Never return a whole row to the public.
- No `any`. Where a type truly cannot be known, use `unknown` and narrow it.

## Rules as code

`bun run check:conformance` (`scripts/checks/`) turns review rulings into checks: policy numbers,
account scope, change counts, translations, imports between modules, and "Screens are built from the
kit". When a review comment would apply to more than one PR, add a check for it. Every message says
what to do instead, because that sentence is what the next person, or agent, acts on.

CI also ratchets quality metrics: complexity, file and function length, import cycles, type coverage
and test coverage may not get worse than the committed baseline. Fixing one shrinks the baseline.
[docs/quality.md](docs/quality.md) explains each limit and how to move a baseline.

## Testing

- **Unit tests** (`layers/<id>/tests/unit/`, Node) for pure logic: the forms engine, pricing, dates.
- **Integration tests** (`layers/<id>/tests/integration/`, workerd with a local D1) for anything that
  reads or writes. `tests/integration/helpers.ts` provides `inContext`, `owner`, `person`, `call`,
  `rows`, `performance` and `deliver`. Prefer a helper that builds a record to hand-written SQL.
- **Browser tests** (`tests/e2e/`, Playwright with axe) for the critical journeys: booking, the door,
  the till, the register.
- Concurrency claims ("race-safe", "at most once") are proven by a test that races.
- New code that handles money, capacity or security is tested branch by branch.

## Writing

- British English in UI copy and documentation. No em dashes: use a comma, colon, semicolon,
  brackets or two sentences.
- Every user-facing string goes through `t()`; the catalogue is the module's `i18n/en-GB.json` (or
  parts under `i18n/en-GB/`).
- Comments say what the code cannot: a constraint, a trap, a contract. Not what the next line does,
  and not the history of how it got there.
- Work is attributed to the person who submitted it. No references to AI assistants or tools, and
  no generated-by or co-author trailers.

## Secrets

Never in code, config defaults, fixtures, tests or documentation. Keys a theatre sets are saved in
the site (KeysCard), not as Worker secrets.
