# Quality ratchets

CI holds the code to "no new debt, and old debt only goes down". Nothing here blocks code written
before 24 November 2026; it stops new code adding to it.

## What is measured

| Metric | Limit for new code | Where it is enforced |
| --- | --- | --- |
| Cyclomatic complexity of a function | 15 | ESLint `complexity` |
| Cognitive complexity of a function | 15 | ESLint `sonarjs/cognitive-complexity` |
| Code lines in a file | 400 | ESLint `max-lines` |
| Lines in a function | 80 | ESLint `max-lines-per-function` |
| Parameters of a function | 4 (pass an options object) | ESLint `max-params` |
| Nesting depth | 4 | ESLint `max-depth` |
| A `.vue` file's `<template>`; its `<script>` | 200 lines; 250 lines | ESLint `vue/max-lines-per-block` |
| Props and emits | Declared with types | ESLint `vue/define-props-declaration`, `vue/define-emits-declaration` |
| Unused props and template refs | None | ESLint `vue/no-unused-properties`, `vue/no-unused-refs` |
| Explicit `any` outside the kit | None | ESLint `@typescript-eslint/no-explicit-any` |
| Import cycles | No more than `metrics.json` | `bun run metrics` |
| Duplicated lines (70 tokens or more) | No more than `metrics.json` | `bun run metrics` |
| Type coverage, strict, server and app | No less than `metrics.json` | `bun run metrics` |
| `@ts-ignore` and `eslint-disable` comments | No more than `metrics.json` | `bun run metrics` |
| Test coverage (unit and integration) | No less than the thresholds in `vitest.config.ts` | `bun run test:coverage` |
| Worker and browser bundles, gzipped | At most 5% above `metrics.json` in one change | `bun run metrics worker` after a build |

The ESLint rules apply to `layers/`, `site/` and `scripts/`, not to tests.

## How the ratchet works

- **ESLint.** Every place that broke a rule on 24 November is listed in `eslint-suppressions.json`,
  so it does not fail. A new break fails. When you fix a listed place, run `bun run lint:prune` to
  shorten the list and commit it. Never add to the list by hand or with `--suppress-all`: fix the
  code, or, if a rule is truly wrong for one line, use `// eslint-disable-next-line <rule> -- why`.
- **metrics.json.** `bun run metrics` measures and fails if a figure is worse. When a figure is
  better it says so: run `bun run metrics --update` and commit `metrics.json` to lock the gain in.
- **Coverage.** When coverage rises, raise the thresholds in `vitest.config.ts`. They never go down.
- **Bundles.** A feature may grow the Worker. If it grows more than 5%, run `bun run build`, then
  `bun run metrics worker --update`, and say in the PR why it grew.

## Splitting code that breaks a limit

- A long function over kinds of thing: a record of handlers keyed by kind.
- A long component: name the blocks of its template and make each a component; move its state and
  behaviour into a composable (`use<Thing>.ts`).
- Many parameters: one options object with a named type.
- An import cycle: move what both files need into a third file.
