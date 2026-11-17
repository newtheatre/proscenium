# The interface

What the core layer gives every module's screens: three shells, five page types, a way to say what
belongs in the navigation, and the rules that keep them honest. Components are Nuxt UI v4; nothing
here is stable before 1.0.

## Shells and the guard

| Shell | Address prefix | For |
| --- | --- | --- |
| Public | anything else | the theatre's own pages (Nuxt Content) and sign-in |
| Account | `/account` | any signed-in person |
| Members' area | `/members` | people for whom the fact `core.member` is true (false until Identity declares it) |
| Console | `/console` | people holding any entry ability of a console entry |
| Site administration | `/admin` | people holding the ability of at least one admin entry; it has no ability of its own, and is not found for anyone else (R-33) |
| Live mode | `/live` | front-of-house and bar screens (not part of phase 1) |

`/account /members /console /admin /live /book /sign-in /setup /api /files` are reserved. A page under a
shell prefix is checked before it renders by `middleware/access.global.ts`, which asks
`GET /api/core/access?path=...`. The order never varies:

1. Signed out: sent to `/sign-in?next=<address>`.
2. Signed in but not entitled to the shell, or no entry covers the address: exactly "page not found".
3. Entitled but lacking the entry's ability: a refusal that says why and what would let them through.

Hiding a link is tidiness; the guard is the enforcement, and the server's own route checks still apply.

## Saying what belongs in the navigation

A module contributes entries to the point `core.navigation` and, if it needs its own console group,
to `core.navigation-group`:

```ts
contributes: {
  'core.navigation-group': [{ id: 'gallery', icon: 'i-lucide-layout-grid', after: 'box-office' }],
  'core.navigation': [
    { id: 'gallery.list', menu: 'console', group: 'gallery', section: 'everyday',
      to: '/console/gallery/list', icon: 'i-lucide-list', ability: 'gallery.sample.view', order: 10 },
  ],
}
```

- The console's platform groups (Tonight to System) are declared by core, in a fixed order.
  A theatre's own group says `before` or `after` one of them.
- Site administration is grouped like the console. Its six groups are declared by core with
  `menu: 'admin'` on `core.navigation-group`, in a fixed order: theatre, modules, access, email,
  connections, upkeep. Every admin entry names one of them; only the shell's Overview, `/admin`
  itself, has none.
- `section` is `everyday` or `setup`; everyday entries come first in a group.
- An entry shows only to someone holding one of its abilities (or any signed-in person, for an
  account entry with none). `match` widens the addresses an entry covers.
- A module with settings gets an entry for its generated settings page without declaring one. It sits in the set-up half of the module's own group (the group of its first console entry, or one named for the module), at `/console/<module>/settings` (core's own settings are the site's and live only in Site administration at `/admin/settings`; the old `/console/system/settings` redirects there), so a module that is off takes its settings page with it.
- A setting declared with `scope: 'site'` is shown with the site's own settings at `/admin/settings`
  (the entry `core.site-settings`, in the modules group) instead of on its module's page; nothing
  else about it changes. Every one of foundations' `core.*` settings is site-scoped.
  `GET /api/core/settings?module=x` gives all of a module's settings, each with its `scope`;
  `&scope=module` narrows it to the module's own page and `?scope=site` gives the site page.
- Labels are translated: `<module>.navigation.<name>.label` for an entry,
  `<module>.navigation.groups.<id>.label` for a group, `<module>.settings-sections.<group>` for a
  heading on the settings page. `bun run check:conformance` fails for a missing key, an unused one,
  and for any page under a shell prefix that no entry covers.

## Page types

- **PageList**: filters, sort and page live in the address; table on a laptop, cards on a phone;
  export of what is filtered; bulk actions once rows are selected.
- **PageForm**: validates with the schema the server validates with; a panel up to six fields, a
  page beyond; a stale save shows both versions and asks which to keep; leaving with changes asks once.
- **PageSettings**: the generated page for a module's settings, one section at a time with a stated
  summary, a Reset to default, who may change each, and a tag where a content page quotes it.
- **PageSteps**: a guided flow with Back, a summary that names the act, and progress kept on the device.
- **PageFrame**, **DataBoundary**, **EmptyState**, **PageFailed**, **RefusalPanel**, **StatusBadge**:
  one title per page, load and fail states, refusals shown from the standard body.

Every page type sits in **PageFrame**, and a page that fits none of them uses it directly. In the
console it is the page's own dashboard panel: the title in the top bar, with the search button and
account menu (**ShellTools**) beside it; elsewhere it is a page header in a container. Its slots are
the same in both: `status` beside the title, `primary` for the page's main action, `toolbar` for
filters under the top bar, the default slot for the body and `footer` for the buttons that act on
the whole page, which stay in view while the body scrolls. `width` is `reading`, `standard` or `full`.

Inside a page, **PageSection** is a titled card (`title`, `description`, and `actions` and `footer`
slots) and **RecordList** with **RecordListItem** (`to`, `icon`, `name`, `description`, `muted`) is a
bordered list of records. Use these two for headings and lists; do not hand-build either. A row's `below` slot
holds what belongs under it (a short form, a detail). **FactStrip** (`facts: { label, value }[]`) is the
row of figures on a record's summary and on a screen's totals.

`bun run check:conformance` holds screens to this ("Screens are built from the kit"): no raw `<form>`
(use `UForm` or `PageForm`), no `w-full` on a form control (controls already fill their field), no
hand-built bordered list, no native date or time input, and no date formatted by hand.

`useConfirm` asks once, naming the act and what it costs; `useUndo` is preferred wherever an act
can be reversed. Browser `alert`, `confirm` and `prompt` are a lint error.

## Calling the API, layouts and moving between pages

- **Requests** go through the app's own fetch, never the global `$fetch`: `useAPI(path, options)` for
  data a screen loads (it is `useFetch` with the same options) and `useNuxtApp().$api(path, options)`
  for an act. A request the server refuses with "confirm it is you" opens the dialogue in place and is
  sent again once the person confirms, so a screen writes nothing for that.
- **Layouts** follow the address: a page under `/console` or `/members` gets that shell's layout with
  no `definePageMeta`. A page that names a layout itself keeps it.
- **Focus** moves to `main#main` after a navigation to another page, and stays where it is when only
  the query changes. Every layout keeps `<main id="main" tabindex="-1">` for this and for the skip link.
- **Titles**: a page sets its own title (PageFrame does it from `title`); the theatre's name is added
  to every one in `app.vue`. A change that is not a navigation, such as a list's new count after a
  filter, is announced with `useAnnouncer()`.
- **Plain functions** live in `app/utils/` (`translate`, `toRefusal`, `callIdentity`, `isCurrent`) and
  are auto-imported; `app/composables/` holds only `use…` composables.

## Finding things: the command palette and settings search

Ctrl or Cmd K (or the Search button in the console's top bar) opens the command palette. It works by
keyboard alone and offers only what the viewer may reach: the screens in their navigation, the quick
actions and record types they hold the ability for, and the settings on pages they may open. It asks
the server for actions and sources when it is first opened, not on every page.

- `core.quick-action` (data point): `{ id, to, icon, ability, keywords? }`. The label is
  `<module>.quick-actions.<name>.label`; `keywords` is a translation key of extra search words.
- `core.search-source` (data point): `{ id, record, ability, route, shells }`. `route` is an `/api/`
  route taking `?q=` and returning `{ ids: string[] }`; the palette resolves the ids to titles and
  addresses through that type's `core.record-resolver`, so every kind of record looks the same. The
  type's name is `<module>.records.<name>`.
- Settings search (UI-15) sits above every generated settings page and in the palette. Every word
  typed must appear in a setting's label or help text; label matches come first; a result opens the
  page with the setting highlighted (`?setting=<key>`). Settings on pages the viewer may not open,
  sensitive settings and settings of modules that are off are never listed.

## Members' area, My account and counts

- **Members' area** (`/members`, layout `members.vue`): a top bar of sections on a laptop; below 640
  pixels a bottom bar of the first four plus More. Its entries are `core.navigation` entries with
  `menu: 'members'`. With `core.members-area.enabled` off, or for anyone for whom the fact
  `core.member` is not true, every `/members` address answers "not found". The name shown is
  `core.members-area.name`.
- **My account** (`/account`): the same page for everyone signed in. A module adds a section through
  `core.account-section` (`target`, `side`, `ability`, `component`, `order`, optional `to`, `icon`,
  `count`, `hideEmpty`). The `component` is the file name of a component in the module's
  `app/account-sections/` folder; it receives `headingId` for its heading. A module that is off
  leaves nothing behind.
- **Counts**: a module registers one through `core.count` (a code point; the contribution's `value(actor)`
  returns a number; a count that fails reads as zero). An entry or section names it with `count`, and
  with `hideEmpty` it is left out while the count is zero. The address of a hidden entry still opens.
- **Colour mode**: `core.appearance.default` is what a first-time visitor sees; a person's own choice
  from the menu is kept; `let-people-choose` off removes the choice; `public-dark` off keeps the public
  pages light. The mode is kept in a cookie and decided on the server before the page renders
  (`server/middleware/appearance.ts`, `middleware/appearance.global.ts`), so no page is drawn in one
  mode and corrected to another.

## Record pages and home pages

- **`PageRecord`** (UI-12): `title`, `status` (always a word, with a tone), one `primary` action, an
  `actions` menu (destructive last), a `summary` strip of four to six facts, the record's `record-type`
  and `record-id`, and the owner's own `tabs` with their contents in the slots `tab-<id>`. Other modules'
  tabs come from `core.record-tab` (`{ id, record, ability, component, order, count? }`): a component in
  the module's `app/record-tabs/` folder that receives `recordId` and nothing else, labelled by
  `<module>.record-tabs.<name>.label`. A tab the viewer may not open, or of a module that is off, is
  absent. The history panel reads the record's audit entries through `GET /api/core/history`, which
  needs the ability `core.history.view`.
- **`PageHome`** (UI-16): a queue. Cards come from `core.home-card` (`{ id, home, ability, component,
  urgency, count? }`), components in the module's `app/home-cards/` folder that receive `count`. They
  sort overdue, today, information; a card whose count is zero is absent. With nothing waiting the page
  says so and offers up to three of the viewer's quick actions.

## Dates, times and money

One language and one time zone, set once: `UApp` takes its `locale` from `core.locale.language`
(`useUiLocale()`), so Nuxt UI's date and time controls read day first on a 24-hour clock for `en-GB`.

- **Text**: `useDates()` gives `day`, `dayLong`, `dayNamed`, `dateTime`, `time` and `range`. An instant
  (milliseconds) is shown in the theatre's time zone, whatever the viewer's; a calendar date
  (`2027-09-01`) is never shifted. Do not call `Intl.DateTimeFormat` in a screen.
- **Fields**: `FieldDate` (takes and gives `2027-09-01`), `FieldDateRange` (`{ start, end }`),
  `FieldDateTime` (an instant in milliseconds, entered in the theatre's time zone, which the field
  names when the viewer is somewhere else) and `FieldMoney` (the currency's minor unit, typed in its
  major unit). The date fields take `min`, `max` and `unavailable`, a function given a day. Do not use
  `type="date"` or `type="datetime-local"`: a native picker ignores the locale and works in the
  viewer's zone.
- `PageForm` has the kinds `date`, `daterange`, `datetime` and `money` for them.
- A date control is typed part by part, so a browser test focuses its first part and types the digits
  (`tests/e2e/date-fields.spec.ts` covers the kit fields; a module need not test them again).

## Choice fields in forms

PageForm's `radio` takes `options: [{ value, label }]` (values may be numbers) and shows one group
with the field's label as its legend. `ticks` takes `options` and, if short notes are allowed,
`notes: { max, label }`; its value is an array of `{ value, note? }` for the ticked options, in the
order of the options, and a note box opens under a tick only when `notes` is given.

## Site administration (R-33)

The fourth shell, at `/admin` (menu value `admin`). It holds install-level screens; the console keeps
day-to-day work and each module's own settings. Someone enters it by holding the ability of at least
one admin entry (the viewer then has the side `admin` and the account menu shows "Site administration");
anyone else finds `/admin` is not there. The layout is `layouts/admin.vue`: the console's frame with a
strip above the page header that says where you are at every width (and carries the drawer toggle
below 1024 pixels), a "Back to console" (or "Back to the site") row where the theatre's mark is,
neutral buttons (the `admin-shell` class on `body` swaps the brand colour out), and a browser title
that starts "Site administration". A page uses it with `definePageMeta({ layout: 'admin' })`.

- **Overview** at `/admin`: `PageHome` with `home="admin"`, cards from `core.home-card` with `home: 'admin'`.
- **Site settings** at `/admin/settings`: `PageSettings scope="site"` shows every setting declared
  with `scope: 'site'`, grouped by module; a module's console settings page links to it when some of
  that module's settings are there. Settings search and the palette link to the right page.
- The palette offers both shells' screens to someone entitled to both, each named with its shell.
- Moving a screen from the console's System group: give it an admin entry (`menu: 'admin'`, a group
  from `ADMIN_GROUP_ORDER`), move its page under `pages/admin/`, and add a redirect from its old address
  in `layers/core/nuxt.config.ts` `routeRules`.

## Seams for Identity

Until Identity lands, `layers/core/server/interface/viewer.ts` describes the viewer from the
actor: `{ signedIn, name?, sides, navigation }`. Components only read that, never a role or an
ability. Sign-out posts `{}` to `/api/core/sign-out`; the sign-in page is read with `?next=`.

## Testing it

`bun run test:browser` builds with `PROSCENIUM_GALLERY=1`, which adds the gallery fixture module
(sample list, form, steps, feedback and denied screens, plus a header-based test sign-in), and runs
Playwright with axe in light, dark and phone widths. Contrast, hydration and rate limits are
all exercised there; the tests use one worker because they share a local database.

### The console's and Site administration's sidebars

One menu: each navigation group of two or more entries is a collapsible section (open when it holds
the current page), a group of one entry is a plain link, and there are no "Everyday" and "Set up"
headings (everyday entries come first). The sidebar is resizable as well as collapsible (Nuxt UI's
dashboard sidebar; the width is kept in a cookie). The foot holds a Documentation link (a placeholder
pointing at the repository's docs until screens have help pages), a Site administration link for anyone
who holds an admin entry, and the account menu. In Site administration the theatre's mark sits where it
does in the console and "Back to console" (or "Back to the site") sits at the foot instead of the
Site administration link. The navbar keeps only search.
## Lists: defineList, filters, sort and columns

A list is declared once and read by the page, the data route and the export. The declaration is
pure data in `layers/core/shared/list.ts` (the kit's `readList` and `defineListSource` import it and add
the SQL side). `defineList(id, { filters, sorts, columns, search, views, defaultView, defaultSort, subRows })`
keeps filter and sort keys literal and refuses a reserved key (`q`, `sort`, `order`, `page`, `size`,
`view`), an undeclared sort or a view naming something undeclared.

`PageList` takes `:list` (a declaration) and, for a choice filter whose options are the theatre's own
(seasons), `:filter-options="{ seasonId: [...] }"`. A page that still passes `columns` and `filters`
gets the same declaration made for it: each filter is a `choice`, each `sortable` column a text sort
(`sortType` words it as numbers or dates).

- **Toolbar:** search (always first, across every field), **Filters** with a count, **Sort**, **Columns**.
  Filters opens a popover on a laptop and a drawer on a phone, one labelled field for each filter, in six
  kinds: `choice`, `choices`, `grouped`, `lookup`, `dates` (relative presets or two days; days are the
  device's until the theatre's day is passed in) and `yes-no`. Changes made in one visit to the panel make
  one history entry. A chip for each filter that is on opens the panel; its cross is named "Remove the
  filter State: Draft".
- **Sort** says how the list is sorted ("Sort: Seats, Lowest first") and lists every declared sort, shown or not.
  A heading sorts in its natural direction, again reverses, a third press returns to the default.
- **Columns** ticks optional columns; the choice is kept on the device for each list
  (`core:list-columns:<id>`), is not in the address, and is cleared on sign-out.
- **Address:** one key for each filter (`state=draft,published`, `when=7d`, `action=orders.refund`),
  `view`, `sort`, `order`, `page`, `size` (25, 50 or 100), left out when default.
- **Server:** `decodeList(query, list, { can, today })` (alias `parse`) validates strictly and answers a typed
  `ListQuery` (folded search words, validated filters, dropped filters, view, sort, page, size) or a
  `ListRefusal` naming the key. Routes call the kit's `readList`, not this.

### Adding to another module's list or record page (R-35)

A module adds to another module's list or record page only through four points:
`core.record-tab`, `core.record-fact`, `core.record-check` and `core.list-column`. There are no slots
and no overrides. All are read-only, gated by `ability`, and absent when the module is off.

| Point | A contribution adds | Built as |
| --- | --- | --- |
| `core.record-fact` | One fact in the summary strip, after the owner's | `{ id, record, ability, component, order }`; the component (in `app/record-facts/`) renders a `<div><dt/><dd/></div>` and gets `recordId` |
| `core.record-check` | One line of the record's checklist | Code point. The file under `server/contributions/core.record-check/` exports `{ record, ability, order, check(recordId) }` answering `{ done, sentence, link }`. It reports only |
| `core.list-column` | A column after the owner's | `{ id, list, ability, component, order }`; the component (in `app/list-columns/`) gets `listId`, `query` and `rowId` and fetches once for the page (one fetch key for the query). Label `<module>.list-columns.<name>.label`. Not yet sortable |

`PageRecord` shows the checklist and an `aside` slot beside the tabs on a laptop; on a phone the
checklist folds to one line above the tabs ("Checklist: 3 of 5").

### The trail and the way back

`trail: { label, to }[]` (parents only, nearest last) on `PageFrame`, `PageRecord`, `PageList` and
`PageSettings`; `PageFrame` alone draws it and never fetches a label. In the console and Site
administration a `UBreadcrumb` of the parents sits in the navbar after the sidebar toggle from 640
pixels up, and below that an icon-only back button ("Back to Productions") takes its place. Outside
the console a worded back link sits above the title. A link to a list returns the list as it was left
(`useListMemory`, kept for the tab's session). A page passes its own parent once its record has arrived.

`PageList` reads four optional fields of the data route's answer: `dropped` (its chips go), `ignoredWords` and
`searchTooShort` ("Words under three letters are not searched"; "Nothing was searched"), and `matched`
(row id to the hidden column that matched, shown under the row's first cell as "Matches Venue: Studio").
