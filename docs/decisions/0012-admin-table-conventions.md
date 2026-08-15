# ADR-0012: Admin tables share one theme and never mutate pagination state

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The admin area is a dozen pages of `UTable`. Each had grown its own copy of the table's look, its own
pagination handling and its own column-visibility menu. Two classes of failure came out of that.

**Divergence.** The `:ui` block was pasted byte-identically into four pages and subtly differently
into a fifth, so the shows table had drifted without anyone deciding it should. Five different page
wrappers (`min-h-screen … p-6`, `p-6 space-y-8`, `space-y-8`, bare `flex flex-col gap-4`,
`h-full overflow-hidden`) each fought the dashboard panel's own padding and scroll container.

**A render loop with no fixed point.** `UTable` rebuilds its TanStack row models whenever its `data`
changes *identity*, and rebuilding writes back through `v-model:pagination`, `:row-selection` and
`:column-visibility` — which re-renders the page. Binding `:data="data ?? []"` against a value that
is null until a fetch resolves therefore allocates a fresh array per render, and each render causes
the next. `/admin/ticket-types` locked the browser tab.

A related failure came from mutating rather than replacing pagination state. `UTable` exposes
pagination through a getter, so what TanStack tracks is the **ref**, not the `pageIndex` inside it.
Assigning `pagination.value.pageIndex = 1` changes the number without changing the object, TanStack
is never notified, and the table keeps rendering page 1 while the pager highlights page 2. Clicking a
page did nothing on `/admin/ticket-types`, `/admin/venues` and `/admin/content-warnings`.

## Decision

**One theme, one set of shared components, and pagination state that is always replaced.**

- The table look lives in `app/app.config.ts` under `ui.table`. `UTable` merges it under any `:ui` a
  page passes, so a page that genuinely needs an override still can. `table-fixed` is deliberately
  absent: fixed layout divides width evenly regardless of content, and since cells are
  `whitespace-nowrap` a long show title or email was clipped mid-word while a status column sat half
  empty.
- `AdminPage`, `AdminTableToolbar`, `AdminTablePagination`, `AdminTableColumnToggle` and
  `AdminFetchError` are the shared shell. `AdminTablePagination` takes plain numbers rather than a
  handle on the table, so it never asks TanStack to re-walk a row model to report a count.
- `useTablePagination()` **replaces** the state object on every write. This is the composable's whole
  purpose.
- Table `data` is bound to a computed that always returns an array. A computed caches, so its
  identity changes only when its dependencies do. Do not reintroduce `?? []` at the binding.

Flex sizing needs both `min-w-0` and `shrink-0` on panel children, pulling in opposite directions on
purpose: `min-w-0` lets a wide table be narrower than its content and scroll itself instead of
pushing the panel sideways; `shrink-0` stops a column flex container squashing a two-line alert down
to one.

## Consequences

- A page that wants a different table look changes the theme, or states the exception in its `:ui`.
- New admin pages get pagination, column toggling and error states by composition rather than by
  copying.
- The render loop is closed at the binding, not only by server-rendering the fetch. Server rendering
  removes the null window; the array-identity rule is what makes it safe regardless.
- `AdminFetchError` exists because no admin page previously rendered anything for a failed fetch. An
  empty table reads exactly like "there are no venues" — the worst message to show someone who is
  about to create a duplicate.
