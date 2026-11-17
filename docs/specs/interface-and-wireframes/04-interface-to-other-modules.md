# 4. Interface to other modules

The interface layer is part of the core (module id `core`). It owns twelve extension points through which modules appear in the shells (`core.navigation-group`, `core.home-card`, `core.record-tab`, `core.account-section`, `core.search-source`, `core.quick-action`, `core.help-page`, `core.on-shift-bar`, `core.tonight-tile` and `core.list-column`, `core.record-fact` and `core.record-check`) and draws three owned elsewhere (`core.navigation` and `core.setup-step` are foundations', `core.public-component` is the public site's). It gives modules seven page components, an editor layout, two shared components (`Calendar` and `LiveKeypad`), one list declaration (`defineList`) and a handful of composables. A module never writes its own frame, menu, settings page or home page.

Everything here is written in [workstream 1's formats](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x): points and contributions, names starting with the module id, labels as derived translation keys. In the tables, **new** marks a point or field this workstream added to those formats; foundations accepted every one of them on 16 November 2026, as the last section records.

## Points the interface offers

All are data points: a contribution is a plain object in the manifest. Each contribution has an `id` and is dropped when its module is off.

| Point | A contribution adds | Status |
| --- | --- | --- |
| `core.navigation` | A destination in a shell's menu | In draft 1; four fields added below |
| `core.setup-step` | A step of a module's guided setup | In draft 1 |
| `core.home-card` | A card on console home, members' home or the Tonight hub | **New** |
| `core.record-tab` | A tab on another module's record page (Tickets on a production) | **New** |
| `core.account-section` | A section of My account (Tickets, Passes), of a member's own account pages, or of a person's page in the console | **New** |
| `core.search-source` | A kind of thing the command palette can find (orders, people) | **New**; uses `core.record-resolver` for titles and links |
| `core.quick-action` | An action in the command palette ("Sell tickets", "New booking") | **New** |
| `core.public-component` | A component a content page may use (what's on, booking button) | **New**; owned by workstream 3, which defines it in its part 4 |
| `core.help-page` | The documentation page for a screen | **New**; derived from the module's `docs/` folder, not hand-declared |

Two further points were added on 16 November 2026 with front of house. `core.on-shift-bar` takes a performance id, a label key with its parameters and an until time. `core.tonight-tile` puts a tile or section on Tonight and takes `ability` exactly as a navigation entry does. Two shared components were added the same day and are specified in Page conventions: `Calendar` (for Spaces, the rota and Training) and `LiveKeypad` (for the bar till and the desk).

**Built on Nuxt UI** (Matt, 16 November 2026). Every shell and shared component here is built from Nuxt UI v4 components on Tailwind CSS v4, as Mailflare is, with Lucide icons; custom markup is used only where Nuxt UI has nothing suitable (the seating plan, the scanner's answer panel, the calendar grid). The page types are thin wrappers that fix the frame and the rules; they do not restyle Nuxt UI. Brand and status colours reach Nuxt UI through its colour settings, fed by `getBrand()`.

### `core.navigation`

```ts
contributes: {
  'core.navigation': [{
    id: 'box-office.orders',
    menu: 'console',
    group: 'box-office',
    section: 'everyday',
    to: '/console/box-office/orders',
    icon: 'i-lucide-receipt',
    ability: 'box-office.order.view',
    order: 20,
    count: 'payments.refunds-awaiting',
  }],
},
```

| Field | Type | Meaning | Status |
| --- | --- | --- | --- |
| `id` | `<module>.<name>` | Unique. Its label is the translation key `<module>.navigation.<name>.label` | Draft 1 |
| `menu` | `account`, `members`, `console`, `admin` or `live` | Which menu it joins. `account` is My account in the public shell; `live` is a tile on the Tonight hub | Draft 1; this is the list workstream 1 left to this workstream |
| `to` | Address | Must sit under the menu's prefix and the module's id | Draft 1 |
| `icon` | Bundled icon name | Shown beside the label | Draft 1 |
| `ability` | One ability, or a list meaning any of. Never a fact: a fact shows an entry by being mapped to an ability | Required on every entry. Hides the entry and guards the address. An `account` entry that every signed-in person has gives the route keyword `signed-in` | Draft 1; "any of" is **new** |
| `order` | Number | Position within its section | Draft 1 |
| `group` | Group id | Console only. Defaults to the module's own group. A module may join another's group (Payments under Money) | **New** |
| `section` | `everyday` or `setup` | Console only. Which half of the group | **New** |
| `count` | Count name | A number shown beside the label, from a count the module registers (its own or one of another module it requires). With `hideEmpty: true` the entry is not shown while the count is zero, which is how "only when the person has a draft" is written: a data condition is a count, never an ability | **New** |
| `match` | Address prefix | Which addresses mark this entry as current, when not simply `to` | **New** |

- The public shell's own header and footer links are the theatre's, declared in its site folder, not contributed by modules. The public shell takes exactly two things from modules: account sections and public components.
- The route guard resolves an address to the longest matching entry and checks its ability. A page under a shell prefix that no entry covers fails the build, so no screen is reachable only by typing its address.
- A sidebar group is declared once by the module that owns it (`core.navigation-group`: id, `menu` (`console`, the default, or `admin`), order, icon). The platform's own groups use the fixed orders in the Shells sub-tab; a theatre's module places itself with `before` or `after`. Admin's groups are `theatre`, `modules`, `access`, `email`, `connections` and `upkeep`, all declared by core; an entry with `menu: 'admin'` names one of them, and Overview alone has no group.

### `core.home-card`

| Field | Meaning |
| --- | --- |
| `id` | `<module>.<name>` |
| `home` | `console`, `members` or `tonight` |
| `ability` | Who is shown it |
| `component` | The card's component, in the module's `app/` folder |
| `urgency` | `overdue`, `today` or `info`: which band it sorts into |
| `count` | Optional count name; a card whose count is zero is not shown |

A card on the Tonight hub is a tile that opens a live screen. It may name a `gate`: a fact the person must hold (a training record) to open it, so the tile can say why it is closed.

### `core.record-tab`

| Field | Meaning |
| --- | --- |
| `id` | `<module>.<name>` |
| `record` | The record type it extends, such as `core.production` |
| `ability` | Who sees the tab, checked against that record |
| `component` | The tab's contents |
| `order` | Position after the owner's own tabs |
| `count` | Optional count on the tab |

The owning module's tabs always come first. A contributed tab receives the record's id and nothing else; it fetches its own data through its own module's routes.

### `core.account-section`, `core.search-source`, `core.quick-action`

| Point | Fields beyond `id` |
| --- | --- |
| `core.account-section` | `target` (`account` or `console-person`), `side` (`audience` or `members`), `ability`, `component`, `order`; optional `to`, `icon` and `count`. This is the one definition of the point (integration ruling R-05); identity and the form builder contribute to it |
| `core.search-source` | `record` (a record type), `ability`, `route` (the module's search route: it takes `?q=` and returns `{ ids }`, which the record type's `core.record-resolver` turns into rows), `shells` (where it may be searched from) |
| `core.quick-action` | `to`, `icon`, `ability`; optional `keywords` (a translation key). A quick action is always an address to go to; there is no `action` field |

Search results are shown through `core.record-resolver`, so a person, an order and a production all look the same in the palette and the module supplies no markup.

## Lists: `defineList`, `core.list-column` and `core.record-fact`

Added 16 November 2026 with the list design (Page conventions, List). A list is declared once, in the module's `shared/` folder, and that one declaration is read by the page, the data route, the export and saved views, so the four cannot disagree.

```ts
export const productions = defineList({
  id: 'core.productions',
  search: ['slug'],
  filters: {
    state:  { kind: 'choices', options: ['draft', 'published', 'withdrawn'] },
    season: { kind: 'lookup', record: 'core.season' },
    when:   { kind: 'dates', presets: ['today', '7d', '30d', 'season'] },
  },
  sorts: {
    run:     { type: 'date', natural: 'asc' },
    title:   { type: 'text' },
    updated: { type: 'date', natural: 'desc' },
  },
  columns: {
    title: { always: true, sort: 'title', card: true },
    run:   { sort: 'run', card: true },
    venue: {},
    state: { card: true },
  },
  views: {
    upcoming: { filters: { when: 'upcoming' }, sort: 'run', expanded: true },
    drafts:   { filters: { state: 'draft' }, sort: 'updated' },
    past:     { filters: { when: 'past' }, sort: 'run', order: 'desc' },
    all:      {},
  },
  defaultView: 'upcoming',
  defaultSort: 'run',
  subRows: { record: 'core.performance', limit: 20 },
})
```

| Part | Rule |
| --- | --- |
| `id` | `<module>.<name>`. Keys the device's column choice and saved views |
| `filters` | Each has a `kind` (`choice`, `choices`, `grouped`, `lookup`, `dates`, `yes-no`), an optional `ability`, and what its kind needs. A filter's key may not be `q`, `sort`, `order`, `page`, `size` or `view`; `defineList` refuses one that is |
| `sorts` | Declared apart from columns, so a list may sort by something it does not show. Each has a `type` (`text`, `date`, `number`), which words its directions, and a `natural` direction |
| `columns` | `always` cannot be hidden; `sort` names a declared sort; `card` marks the two or three that survive on a card; `hidden` starts a column off. Every text column is searched |
| `search` | Further fields to search that are not columns. Search itself cannot be turned off |
| `views` | Built-in views: a name, filters, a sort and whether rows start open. `view=` takes a built-in name or a saved view's id (prefix `svw`) |
| `subRows` | The child record type and the most children shown for each parent (20 at most) |
| Labels | Derived translation keys, `<module>.lists.<name>.<part>.<key>` |

On the server, `readList(event, source)` is the one way a data route reads the address. A list's declaration is in two parts: the shared part above (`defineList`: validation, the address codec, types and what the page needs), and a server part, `defineListSource(list, ...)`, in the module's server folder, holding the columns, indexes and subqueries; a route passes the source. It validates every key against the declaration, refuses an unknown key or value with a standard refusal, drops a filter the viewer may not use, resolves a view, always adds the id as the last sort key, and answers a child filter or search by subquery, never by an id list. `readList` and `defineList` are specified and owned by foundations (Foundations Doc, part 4, "Lists: defineList and readList", rules L1 to L7 and Search), accepted 16 November 2026 with these limits. An unknown key, value, sort or view is refused with code `core.list.unknown`; `readList` also answers `dropped`, the filters left out for want of an ability, so the page removes their chips. A sort declares the index that answers it or a bound, and the conformance check refuses one with neither; a contributed column's sort meets the same rule. Paging is by offset: page sizes are 25, 50 and 100, and a page beyond 10,000 rows is refused with `core.list.too-deep`, when the page asks the person to narrow the list. Search covers every text column the data formats allow: never an encrypted or special column, and a personal column only under the ability that shows it. How search is matched is decided by foundations' proof P-LIST-1, and no module writes its own matching meanwhile. A `core.record-check` runs as the viewer in one bounded statement and its `sentence` is a label key with values.

**`core.list-column`** lets a module add a column to another module's list (box office's Sales on the productions list).

| Field | Meaning |
| --- | --- |
| `id` | `<module>.<name>` |
| `list` | The list it joins, such as `core.productions` |
| `ability` | Who sees the column; without it the column is absent and is not searched |
| `component` | The cell, in the module's `app/` folder |
| `order` | Position after the owner's own columns |
| `sort` | Optional: a sort the contributing module answers |

A contributed column receives the list id and the page's query, not a list of row ids, and makes one request for the page; its server route finds the rows by the same subquery the list uses. The owner's columns always come first, and a contributed column is optional unless the list's owner marks it otherwise.

**`core.record-fact` and `core.record-check`.** Integration ruling R-35 (16 November 2026, its condition met by Matt's acceptance of the list proposal the same evening) replaces "`core.record-tab` is the one way to add to a record page": a module adds to another module's record page or list only through four named points, `core.record-tab`, `core.record-fact`, `core.record-check` and `core.list-column`. There are no slots and no overrides.

| Point | Fields beyond `id` | Rule |
| --- | --- | --- |
| `core.record-fact` | `record`, `ability`, `component`, `order` | Adds one fact to the summary strip, after the owner's facts. Read-only. The component receives the record's id and nothing else |
| `core.record-check` | `record`, `ability`, `order`, `check(recordId)` | Adds one line to the record's side-panel checklist ("Ready to publish?" on a production). `check` runs on the server and answers `{ done, sentence, link }`. It reports only: whether a missing line stops the action stays the owner's own rule |

All three new points are gated by `ability`, absent when their module is off, and declared here and indexed by foundations.

## Page components

A module's pages are built from these. Each fixes the frame described in the Page conventions sub-tab and exposes slots.

| Component | Page type | A module supplies |
| --- | --- | --- |
| `PageList` | List | A `defineList` declaration, cell and row-action slots, and the data route. Slots: `cell-<column>`, `subcell-<column>` for sub-rows, `expanded` for a detail panel, `actions` |
| `PageRecord` | Record | Title, status, summary facts, actions, its own tabs, and optionally the `aside` slot for a side panel |
| `PageForm` | Form | A schema and field components; the component decides panel or page |
| `PageSettings` | Settings | Nothing: the page draws a declared settings page (`settingPages`) and the groups placed on it |
| `PageHome` | Home | Nothing: cards come through the point |
| `PageSteps` | Steps | Step components and a schema per step |
| `PageLive` | Live | The task area, and which data to keep on the device |

Shared pieces a page may use directly: the confirmation dialog, the refusal panel, the money total, the status badge, the person chip, the date and time display, the empty state, the on-behalf-of banner.

These components, their props and slots are part of the public interface that a theatre's own module may rely on. Changing one is a breaking change listed in release notes.

**The trail** (added 16 November 2026; Matt approved the design with a thumbs-up that evening; Page conventions, "The trail and the way back"). `PageRecord`, `PageForm`, `PageSettings` and `PageList` take one prop, `trail: { label, to }[]`, the page's parents only, nearest last, and pass it through; `PageFrame` alone draws it. In the console and site administration it is a `UBreadcrumb` in the navbar's leading slot from 640 pixels up and an icon-only back button to the nearest parent below that; in the members' area and My account it is a worded back link in the page header's headline. A crumb that points at a list uses that list's remembered address.

## Composables

| Composable | Gives a page |
| --- | --- |
| `useViewer()` | Who is signed in, which shells they may enter, what they can do. From workstream 2 |
| `useCan(ability, record?)` | Whether the viewer may do something, for showing and hiding. Never the enforcement |
| `useListQuery()` | `useListQuery(list)`: search, filters, view, sort and page read from and written to the address against a `defineList` declaration, with one history entry for each visit to the Filters panel; the column choice from the device |
| `useConfirm()` | The confirmation dialog, with the thing and the consequence |
| `useRefusal()` | Turns a server refusal into the standard "why, and what would let you through" panel |
| `useLiveData(name)` | A device copy of named data for live screens, with its age |
| `useQueuedWrite(route)` | A write that is sent now or queued when offline, with an idempotency key |
| `useCount(name)` | A registered count, loaded after the page |
| `useHelp()` | The help page for the current screen |

## What the interface needs from others

| Need | From | Used for |
| --- | --- | --- |
| The viewer: identity, entitled shells, abilities, current facts | 2. Identity | Account menu, navigation filtering, landing |
| A refusal format: a code, a reason key, and what would let the person through | 1. Foundations | The refusal panel |
| An idempotency key honoured by every write route a live screen calls | 1. Foundations | The offline queue; without it a retried write may apply twice |
| A record resolver per record type | Every module | Search, audit history, notifications |
| A registered count per badge | Every module | Menu and card counts |
| A brand token set (colours in light and dark, fonts, logo) | 3. Public site | Every shell |
| A data version per live data set | Modules with live screens | Telling a device its copy is stale |

Added 16 November 2026: the interface also needs `readList(event, source)` and `defineListSource` from foundations (described under Lists above), and from every module a `defineList` declaration for each list it shows.

## Events

The interface layer announces none. It listens for foundations' `core.module.enabled` and `core.module.disabled`, only to refresh menus on open pages.

## Agreed with workstream 1

Workstream 1 accepted these on 16 November 2026 and is logging them in its formats.

1. Navigation entries gain `group`, `section`, `count` and `match`. `ability` takes one ability or a list, not a fact.
2. The field is named `menu`, not shell, because a menu is not always a shell: the menus a navigation entry may name are `account`, `members`, `console`, `admin` and `live`. There are four shells (public, members' area, console and site administration) and a live mode, which is not a shell (integration ruling R-33). `core.home-card` and `core.search-source` take the same `admin` value where they name a menu or a shell. Where a setting is drawn is declared for its group in the manifest's `settingGroups` and `settingPages`, which are foundations' (integration ruling R-37; the per-setting `scope` and the `/admin/settings` page are withdrawn). The whole reserved list, the same as foundations', is `/account`, `/members`, `/console`, `/admin`, `/live`, `/book`, `/sign-in`, `/setup`, `/api`, `/files`, `/mailing`, `/forms`, `/whats-on`, `/shows` and anything starting with an underscore; the build refuses a theatre's page under one.
3. The new core points above are declared here and indexed by workstream 1. The shape of `core.public-component` is owned and defined by workstream 3. `/files` is also reserved, for workstream 3, and `/mailing` for communications' public confirm and manage pages, which are reached by token with no sign-in and drawn in the public shell. `PageEditor`, the layout added for the form builder, is specified in Page conventions.
4. The build checks that every page under a shell prefix is covered by a navigation entry.
5. A route declared idempotent requires an `Idempotency-Key` header and replays its stored answer. Every refusal has the body `{ code, reason, remedy?, fields? }`, where reason and remedy are translation keys.
