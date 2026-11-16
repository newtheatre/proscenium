# Review: Nuxt UI best practice

A read-only review of the interface on `next` at `dacf1e4` (16 November 2026) against Nuxt UI v4:
where hand-built markup could be a Nuxt UI component, and where inline Tailwind classes could become
a component prop, the `ui` prop, an `app.config.ts` default or a shared component. Nothing has been
changed. Each finding gives the place, what is there now and the suggested replacement, so they can
be picked off one at a time.

## What was read

- Every Vue file under `layers/core/app` (4 layouts, 20 components, 16 pages; about 4,200 lines),
  `app.config.ts`, `assets/css/main.css` and both `nuxt.config.ts` files. The gallery fixtures under
  `tests/fixtures` were skimmed only.
- Nuxt UI's agent skill and its reference guides (dashboard, data tables, forms, overlays, auth,
  component selection, design system, conventions) and the component pages for DashboardPanel,
  DashboardNavbar, DashboardToolbar, Table, PageHeader, PageCard, PageGrid, PageList, Footer, Error,
  AuthForm, PinInput, CheckboxGroup, FieldGroup, Main, Empty and User, all from
  <https://ui.nuxt.com/llms.txt>. The MCP server serves the same pages; it was not connected in the
  review session, so the Markdown pages were read directly.
- Mailflare's `nuxt` branch at `d6c08fb`: `app/app.config.ts`, `app/layouts/dashboard.vue` and
  `auth.vue`, and the shared `app/components/app/*` (Page, Navbar, List, ListItem, ConfirmModal,
  SkipLink), plus a count of which Nuxt UI components it uses.

Paths below are relative to `layers/core/app` unless they start with something else.

## Summary

The foundations are right: `UApp` wraps the app, colours are semantic throughout (no raw palette
classes anywhere), Nuxt UI is loaded before Nuxt Content, icons are bundled, and feedback states
already go through `UAlert`, `UEmpty`, `USkeleton`, `UBadge` and toasts. The gaps are structural
rather than cosmetic. The kit's page types were written as plain markup inside one shared dashboard
panel, so the console does not use the dashboard pattern Nuxt UI and Mailflare are built around, and
the two record pages that exist were hand-built instead of using the kit's own page types.

| # | Finding | Priority | Size |
|---|---|---|---|
| 1 | Console pages should own their `UDashboardPanel`, navbar and toolbar | High | Medium |
| 2 | `PageList` draws its own `<table>`; use `UTable` | High | Medium |
| 3 | Record pages bypass `UForm` and the kit's `PageForm` | High | Medium |
| 4 | Console sidebar nests navigation landmarks; use one `UNavigationMenu` | High | Small |
| 5 | Section headings and bordered lists are hand-built five ways | Medium | Medium |
| 6 | Confirmation dialogs should open through `useOverlay` | Medium | Small |
| 7 | Public and members' shells: `UFooter`, `UColorModeImage`, no wrapper `div` | Medium | Small |
| 8 | `app.config.ts` is missing defaults Mailflare sets; 23 redundant `w-full` | Medium | Small |
| 9 | One-time codes should use `UPinInput` | Medium | Small |
| 10 | Members' bottom bar is raw markup inside the layout | Medium | Small |
| 11 | Smaller replacements (error page, link grids, failed state, field groups) | Low | Small |
| 12 | Unused or doubtful code found on the way | Low | Small |

A suggested order is at the end.

## High priority

### 1. Console pages should own their dashboard panel

**Where:** `layouts/console.vue:71-97`, `components/PageFrame.vue:15-38`, and every page type built
on it (`PageList.vue:124-180`, `PageForm.vue:396`, `PageSteps.vue:173`, `PageSettings.vue:232`).

**Now:** the layout renders one `UDashboardPanel` for the whole console, with a `UDashboardNavbar`
that has no title, and puts the page in `#body`. `PageFrame` then draws its own header (`h1`,
description, primary action) and its own padding inside that body.

**Why it matters:**

- Nuxt UI's dashboard pattern is `UDashboardGroup` and sidebar in the layout, then **each page**
  renders `UDashboardPanel` with `UDashboardNavbar` (title, actions) and an optional
  `UDashboardToolbar` in `#header`. The navbar title is an `h1` by default, so "one title per page"
  is kept without `PageFrame`'s own heading.
- The panel body already has `p-4 sm:p-6` and `gap-4 sm:gap-6`. `PageFrame` adds `px-4 py-6 sm:px-6`
  on top, so console content is padded twice, and the `mb-3`, `mb-6`, `mt-4`, `mt-8` margins across
  the page types duplicate the gap the panel provides.
- The title and the page's primary action scroll away with the content. In a panel header they stay
  put.
- `PageForm`'s save bar is a `sticky bottom-0` div with negative margins that have to match the
  frame's padding (`PageForm.vue:396`). `UDashboardPanel` has a `#footer` slot (and `USlideover` has
  one for the panel mode) that does this with no classes.
- `PageList`'s filter bar (`PageList.vue:124-180`) is what `UDashboardToolbar` is for.

**Suggested replacement:** follow Mailflare's `app/components/app/Page.vue` and `Navbar.vue`. Make
`PageFrame` shell-aware (or add a console variant) so that in the console it renders:

```vue
<UDashboardPanel :id="id">
  <template #header>
    <UDashboardNavbar :title="title">
      <template #leading><UDashboardSidebarCollapse /></template>
      <template #right><slot name="primary" /> …search button, account menu…</template>
    </UDashboardNavbar>
    <UDashboardToolbar v-if="$slots.toolbar"><slot name="toolbar" /></UDashboardToolbar>
  </template>
  <template #body><UContainer>…</UContainer></template>
  <template v-if="$slots.footer" #footer><slot name="footer" /></template>
</UDashboardPanel>
```

and the layout keeps only `UDashboardGroup`, the sidebar, the command palette and
`<main id="main" tabindex="-1">` around the slot, as Mailflare's `dashboard.vue:86` does. Because
modules only ever use the page types, this is a change inside the kit: no module page needs editing.
The three named widths (`.width-reading`, `.width-standard`, `.width-full` in `main.css`) can stay,
applied to the container inside the body. In the public and members' shells `PageFrame` keeps a
heading, which could be `UPageHeader` (`title`, `description`, `links`) inside `UContainer`.

### 2. `PageList` draws its own table

**Where:** `components/PageList.vue:257-365` (table), `:88-96` (selection), `:82-86` (sorting).

**Now:** a hand-written `<table>` with eleven class strings, hand-rolled sort buttons, a `Set` for
selection and per-row click handling. Mailflare uses `UTable` for its tables (`pages/activity.vue`,
`pages/ai-usage.vue`) and frames every table once in `app.config.ts`.

**Suggested replacement:** `UTable`, keeping the card list for phones (`PageList.vue:368-425`),
since "no sideways scrolling on a phone" is a design decision and `UTable` has no card mode.

| Today | With `UTable` |
|---|---|
| `<caption class="sr-only">` | `caption` prop |
| wrapper `rounded-lg border`, `thead bg-elevated` | `table.slots` in `app.config.ts`, as Mailflare does |
| `selected` Set, `toggle()` | `v-model:row-selection` with `:get-row-id` (stable ids are needed for server pages) |
| `sortBy()`, `ariaSort()` | `v-model:sorting` with `:sorting-options="{ manualSorting: true }"`, still written to the address by `useListQuery` |
| `@click="open(row)"` and `cursor-pointer` | `@select` |
| row hover and divider classes | built in |
| `<slot :name="`cell-${c.key}`">` | forward to `UTable`'s `#<key>-cell` slot, passing `row.original`, so module pages keep their slot names |
| first-load skeleton from `DataBoundary` | optionally `loading`; `sticky` gives a fixed header for long lists |

Check when doing it that the sortable header still exposes `aria-sort`; a column's `header` render
function can keep the present button if not.

### 3. Record pages bypass `UForm` and the kit's own page types

**Where:** `pages/console/programme/venues/[id].vue:146-259`, `:335-365`, `:375-432`;
`pages/console/programme/venues/index.vue:90-125`; `pages/console/system/vocabularies/index.vue:79-114`.

**Now:** five plain `<form @submit.prevent>` elements. `UFormField` is given `required` but no `name`
and no schema, so nothing is validated in the browser; the button is disabled with
`:disabled="!form.name.trim()"`; and server errors are mapped by hand
(`:error="refusal?.fields?.name ? refusal.reason : undefined"`, `venues/index.vue:99`). The modals'
footers hold a single button with no Cancel.

**Suggested replacement:** these are exactly what `PageForm` already does well (schema shared with
the server, `setErrors` from a refusal, conflict handling, unsaved-changes prompt, a panel for six
fields or fewer). "New venue", "New vocabulary" and "Add space" should be `PageForm` in panel mode;
the venue's details form should be `PageForm` or at least `UForm` with a schema and named fields.
Where a modal form stays, use Nuxt UI's documented shape: `UForm` with an `id` in `#body`, and
`#footer="{ close }"` with Cancel and a `type="submit" form="…"` button.

The wider point for build threads: a page that does not fit a kit page type should extend the page
type, not drop to raw markup. `venues/[id].vue` alone holds 35 of the layer's 233 `class`
attributes, more than any file except `PageList`.

### 4. The console sidebar nests navigation landmarks

**Where:** `layouts/console.vue:50-62`, `:22-23`.

**Now:** a `<nav>` wraps one `UNavigationMenu` per module group. `UNavigationMenu` renders its own
`nav` element, so a screen reader hears a navigation region containing up to fourteen more. The
"Everyday" and "Set-up" labels are shrunk with `class: 'text-xs'` on the item.

**Suggested replacement:** one `UNavigationMenu` given `NavigationMenuItem[][]` (an array of arrays
renders separated groups, which is the documented way to group a sidebar), with its own
`aria-label` and no wrapper. Label size belongs in `app.config.ts` (`navigationMenu.slots.label`) or
the menu's `ui` prop, not on each item. Mailflare puts `role="navigation"` and the label on
`UDashboardSidebar` itself (`dashboard.vue:41-44`), which is worth copying.

Also here: `AccountMenu` is rendered twice on a laptop (`console.vue:65` in the sidebar footer and
`:83` in the navbar). Mailflare keeps it in the sidebar footer only and passes `collapsed` to it.
`UDashboardSearchButton` conventionally sits in the sidebar header with `:collapsed`.

## Medium priority

### 5. Section headings and bordered lists are each built several ways

**Section headings.** A section's `h2` is styled differently in every file:

| Place | Classes |
|---|---|
| `pages/console/programme/venues/[id].vue:142`, `:269`, `:321` | `text-base font-semibold` |
| `pages/console/system/vocabularies/[key].vue:209` | `text-sm font-semibold` |
| `components/PageSettings.vue:139` | `mb-3 text-lg font-semibold text-highlighted` |
| `components/PageSteps.vue:138` | `mb-4 text-lg font-semibold text-highlighted outline-none` |
| `pages/console/system/email.vue:116` | `font-semibold text-highlighted` (inside a `UCard`) |
| `components/RecoveryCodes.vue:30` | `font-semibold text-highlighted` |

Suggested: one kit component, `PageSection`, with `title`, `description` and an `#actions` slot,
built on `UPageCard` (`title`, `description`, `variant`) or `UCard` with `#header`. Mailflare's
settings and admin pages use `UCard` for this throughout (63 uses). `email.vue:81-144` then needs no
hand-written heading or `mt-1`, `mt-3`, `mt-4` spacing, because the card's slots space themselves.

**Bordered lists.** `divide-y divide-default rounded-lg border border-default` appears five times
(`PageSettings.vue:142`, `SettingsSearch.vue:35`, `venues/[id].vue:283`,
`vocabularies/[key].vue:136`, `:215`) and the row `flex items-center gap-3 px-3 py-2` three times.
Mailflare solved this once with `AppList` and `AppListItem` (a `UUser` for icon, name and
description, a trailing slot for actions, and a chevron when the row is a link). The kit should have
the same pair (say `RecordList` and `RecordListItem`); the venue's spaces, a vocabulary's terms and
the settings rows all fit it.

`SettingsSearch.vue:19-56` is an input plus a hand-built result list with no arrow-key movement.
`UCommandPalette` used inline, or `UInputMenu`, gives the list, the keyboard behaviour and the
"nothing found" state.

### 6. Confirmation dialogs should open through `useOverlay`

**Where:** `app.vue:9-10`, `composables/useConfirm.ts`, `components/ConfirmDialog.vue`,
`components/ConfirmItsYouDialog.vue`.

**Now:** both dialogs are mounted permanently in `app.vue` and driven by a `useState` value that
holds the pending request, including its `resolve` function.

**Suggested replacement:** Nuxt UI's `useOverlay().create(ConfirmDialog)` then
`await modal.open(props).result`, with the dialog emitting `close` with `true` or `false`. This is
the pattern in the Nuxt UI overlays guide and in Mailflare (`app/utils/confirm-dialog.ts`,
`ConfirmModal.vue`). `useConfirm()` keeps its signature, so no caller changes; `app.vue` loses both
tags; nothing non-serialisable sits in `useState`; and two confirmations can no longer overwrite
each other.

`ConfirmDialog.vue:19` wraps its buttons in `div.flex.w-full.justify-end.gap-2`. Mailflare sets
`modal: { slots: { footer: 'justify-end gap-2' } }` once in `app.config.ts` so every dialog footer
takes its buttons directly.

### 7. Public and members' shells

**Where:** `layouts/default.vue`, `layouts/members.vue`.

- **Footer.** `default.vue:85-110` is a hand-built `<footer>` with `UContainer` and a `ul` of links.
  `UFooter` gives the border, container and `#left`, `#default`, `#right` slots; the links can be a
  `UNavigationMenu` with `variant="link"`, as in Nuxt UI's own footer example.
- **Logo.** `default.vue:41-53` swaps the dark logo with
  `<source media="(prefers-color-scheme: dark)">`. That follows the device, while the page's colour
  mode follows the `dark` class, so someone who picks a mode by hand, or a theatre that pins its
  public pages light, gets the wrong logo. `UColorModeImage` (`light` and `dark` props) follows the
  class.
- **Wrapper.** `div.flex.min-h-screen.flex-col` with `flex-1` on `UMain` (`default.vue:37`, `:76`;
  `members.vue:26`, `:44`) repeats what `UMain` already does: it sets
  `min-height: calc(100vh - var(--ui-header-height))`. The wrapper and `flex-1` can go.
- **Members' title.** `members.vue:30-31` styles two spans by hand; `UHeader`'s `title` prop plus a
  `UBadge` or the `#left` slot would do it without `ml-3 text-sm text-muted`.
- **Pinned light mode.** `default.vue:14-22` toggles the `dark` class on `<html>` itself, beside
  `@nuxtjs/color-mode`, which owns that class. Colour mode's own forcing (`colorMode` in page meta)
  is the supported route. This belongs to the general Nuxt review (hydration); it is noted here
  because Nuxt UI registers the module.

### 8. `app.config.ts` defaults, and the classes they would remove

**Where:** `app.config.ts`, compared with Mailflare's `app/app.config.ts`.

Proscenium already sets `w-full` on `input`, `textarea`, `select` and `selectMenu`, as Mailflare
does. Even so, `class="w-full"` is written on those same components 23 times, all redundant:
`PageForm.vue:325`, `:362`, `:373`, `:390`; `PageList.vue:138`, `:173`;
`SettingsSearch.vue:23`; `ConfirmItsYouDialog.vue:106`; eleven in `venues/[id].vue`; two each in
`venues/index.vue` and `vocabularies/index.vue`.

Mailflare also sets these, which Proscenium lacks:

| Mailflare default | What it removes here |
|---|---|
| `inputNumber`, `inputDate`, `inputTime`: `w-full` | `w-full` on `UInputNumber` (`PageForm.vue:383`; `inputTags` would do the same for `PageSettings.vue:185`); needed before dates and times move to `UInputDate` and `UInputTime` |
| `table: { slots: { root: 'rounded-lg border border-default', thead: 'bg-elevated/50' } }` | the table frame in finding 2 |
| `modal: { slots: { footer: 'justify-end gap-2' } }` | the footer wrapper in finding 6 |

Worth adding for Proscenium's own repeats: `empty` padding (`EmptyState.vue:18` passes `py-12`
every time), `navigationMenu.slots.label` (finding 4) and a default `variant: 'subtle'` for `alert`
and `badge`, which is typed out on all 11 alerts and most badges.

### 9. One-time codes should use `UPinInput`

**Where:** `pages/sign-in/index.vue:139-145`, `components/ConfirmItsYouDialog.vue:102-108`.

**Now:** a `UInput` with `inputmode="numeric"`, `autocomplete="one-time-code"` and, on sign-in, a
`pattern`.

**Suggested replacement:** `<UPinInput v-model="code" otp type="number" :length="6" />`. It is the
component Nuxt UI lists for verification codes: six boxes, paste handling, automatic fill from the
device, and a `complete` event that can submit the form without a button press.

### 10. The members' bottom bar

**Where:** `layouts/members.vue:52-92`.

**Now:** a fixed `<nav>` of raw `NuxtLink`s and a raw `<button>`, each with a seven-class string,
and a `UBadge` squeezed after the label for counts.

Nuxt UI has no bottom tab bar, so custom markup is fair here, but it should not live in the layout.
Suggested: a `MembersTabBar` component whose tabs are `UButton` (`variant="ghost"`, `color`, `to`,
`active`, with the icon-above-label shape set once through its `ui` prop), `UChip` on the icon for
the count, and `UDropdownMenu` (already used) for More. The 48 pixel target should come from the
`--proscenium-target-live` style token rather than `min-h-12`.

## Low priority

### 11. Smaller replacements

- **Error page.** `error.vue:21-50` builds its own heading, text and button. `UError` takes the
  `error`, a `redirect` and a `clear` button; the refusal panel fits its default slot. It renders a
  `main` by default, so pass `as="div"` inside the layout's `UMain`.
- **Link grids.** `pages/members/index.vue:17-36` and `pages/account/index.vue:19-35` are `ul` grids
  of outline buttons. `UPageGrid` with `UPageCard` (`to`, `icon`, `title`, `description`) is the
  component for a grid of destinations and gives each a line of description.
- **Failed state.** `components/PageFailed.vue:9-22` is a hand-built bordered box. `UAlert` with
  `color="error"` and `actions` (as `DataBoundary.vue:50-59` already does for a stale refresh) or
  `UEmpty` with `variant="outline"` replaces it.
- **Input with its button.** `vocabularies/[key].vue:115-133` and `:149-167` put an input and a
  button side by side with `flex gap-2`. `UFieldGroup` joins them as one control.
- **Conflict choice.** `PageForm.vue:277-292` wraps `URadioGroup` in a hand-styled `fieldset` and
  `legend`. `URadioGroup` has a `legend` prop and a `variant="table"` that draws the border.
- **Checkbox label twice.** `PageForm.vue:375-379` gives the checkbox the same label as its
  `UFormField` (`:319`), so the words appear twice. Nuxt UI's form guide leaves the field's label
  off for a single checkbox.
- **Dates and times.** `PageForm`'s `date` kind and `PageSettings`' `time` kind (`PageSettings.vue:191`)
  use the browser's native pickers through `UInput`. `UInputDate` and `UInputTime` match the rest of
  the interface and follow the app's locale; Mailflare uses both.
- **Action feedback.** `pages/console/system/email.vue:146-153` shows "done" as an inline success
  alert. Nuxt UI's guidance is a toast for feedback after an action (as `PageForm` does) and an
  alert for something that stays true.
- **Sign-in.** The page hand-assembles provider buttons, a separator and a form
  (`pages/sign-in/index.vue:75-123`). `UAuthForm` covers that shape (`providers`, `fields`,
  `separator`, a `#validation` slot for the refusal). It is opinionated and Mailflare does not use
  it either, so this is optional; the passkey-first order and Turnstile may be easier to keep as
  they are.
- **Public page heading.** `pages/[...slug].vue:10-19` renders the content with no `UPageHeader`, so
  the page's title depends on the Markdown having its own top heading.
- **Type cast.** `components/CommandPalette.vue:81` passes `groups as any`; typing the groups as
  `CommandPaletteGroup[]` removes the cast.

### 12. Unused or doubtful code found on the way

- `layouts/centred.vue` is not used by any page. Sign-in and setup render in the public shell
  through `IdentityCard`. Either use it for those pages (Mailflare's `auth.vue` is the same idea,
  with the `UCard` in the layout) or delete it.
- `--proscenium-target`, `--proscenium-target-public` and `--proscenium-target-live` are defined in
  `main.css:22-26` and referenced nowhere.
- `main.css:41-43` defines the three widths as plain classes. Declaring them with Tailwind's
  `@utility` would let them take variants (`lg:width-full`) and show in editor completion.

## Inline Tailwind: what remains after the above

The layer has 233 `class` attributes in 4,200 lines. Roughly where they go:

| Pattern | Count | Goes to |
|---|---|---|
| `w-full` on a control that is already full width | 23 | delete (finding 8) |
| `PageList`'s table | 11 | `UTable` and `app.config.ts` (finding 2) |
| `space-y-*` stacks inside forms and page bodies | 26 | mostly the panel body's and `UForm`'s own gap (findings 1, 3) |
| `text-sm text-muted` paragraphs | 21 | `description` and `help` props of `UFormField`, `UPageCard`, `UEmpty`; the rest are fine |
| Section headings | 11 | `PageSection` (finding 5) |
| Bordered lists and rows | 8 | `RecordList` (finding 5) |
| Page and save-bar padding and margins | about 15 | `UDashboardPanel` slots (finding 1) |
| Shell wrappers, footer, bottom bar | about 25 | findings 7 and 10 |

What is left is mostly legitimate: a deliberate width on one control (`w-48`, `w-64`), `sr-only`,
`truncate` and `min-w-0`, and layout inside a genuinely custom component. A rule that would keep it
that way: **pages carry no classes except a width on a control; anything else is a prop, an
`app.config.ts` default or a kit component.** That could be a conformance check in `scripts/check.ts`
that counts `class=` in `layers/*/app/pages`.

## What is already right

- `UApp` at the root, with toasts used for saved feedback.
- Semantic colour utilities only; status colours fixed in `app.config.ts`; contrast handled once in
  `main.css` through Nuxt UI's CSS variables.
- `@nuxt/ui` before `@nuxt/content`; fonts and icons bundled.
- `UDashboardGroup`, `UDashboardSidebar` (collapsible, a drawer on a phone) and `UDashboardSearch`
  for the console; `UHeader` and `UMain` for the public and members' shells.
- `EmptyState` wraps `UEmpty`, `StatusBadge` wraps `UBadge`, refusals are `UAlert`, loading is
  `USkeleton`, `PageSteps` uses `UStepper`, paging uses `UPagination`.
- `PageForm` uses `UForm` with the server's schema and `setErrors`, and `USlideover` for its panel.

## Passed to the general Nuxt review

Seen here but not Nuxt UI matters: the Identity and venue pages write their strings in the template
rather than through `t()` (`sign-in/*`, `setup.vue`, `account/passkey.vue`, `RecoveryCodes.vue`,
`venues/*`, `vocabularies/*`, `system/email.vue`); `SkipLink.vue` relies on the hash alone, where
Mailflare's focuses the target so it works after client-side navigation; and the colour-mode class
toggling in finding 7.

## Suggested order

1. Finding 8 (`app.config.ts` defaults, delete redundant `w-full`): an hour, no behaviour change.
2. Findings 4 and 6 (one navigation menu; `useOverlay`): small and self-contained.
3. Finding 1 (page-owned panels) before more console pages are built, because every page type
   changes shape. Findings 2 and 5 fit naturally in the same pass.
4. Finding 3 (move the venue and vocabulary pages onto `PageForm`), then 7, 9 and 10.
5. Finding 11 as files are next touched.
