# 4. Interface to other modules

The interface layer is part of the core (module id `core`). It offers modules nine extension points to appear in the shells, seven page components to build screens from, and a handful of composables. A module never writes its own frame, menu, settings page or home page.

Everything here is written in draft 1 of [workstream 1's formats](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x): points and contributions, names starting with the module id, labels as derived translation keys. Where this asks for something draft 1 does not yet have, it is marked **new**.

## Points the interface offers

All are data points: a contribution is a plain object in the manifest. Each contribution has an `id` and is dropped when its module is off.

| Point | A contribution adds | Status |
| --- | --- | --- |
| `core.navigation` | A destination in a shell's menu | In draft 1; four fields added below |
| `core.setup-step` | A step of a module's guided setup | In draft 1 |
| `core.home-card` | A card on console home, members' home or the Tonight hub | **New** |
| `core.record-tab` | A tab on another module's record page (Tickets on a production) | **New** |
| `core.account-section` | A section of My account in the public shell (Tickets, Passes) | **New** |
| `core.search-source` | A kind of thing the command palette can find (orders, people) | **New**; uses `core.record-resolver` for titles and links |
| `core.quick-action` | An action in the command palette ("Sell tickets", "New booking") | **New** |
| `core.public-component` | A component a content page may use (what's on, booking button) | **New**; owned by workstream 3, which defines it in its part 4 |
| `core.help-page` | The documentation page for a screen | **New**; derived from the module's `docs/` folder, not hand-declared |

### `core.navigation`

```ts
contributes: {
  'core.navigation': [{
    id: 'box-office.orders',
    shell: 'console',
    group: 'box-office',
    section: 'everyday',
    to: '/console/box-office/orders',
    icon: 'i-lucide-receipt',
    ability: 'box-office.order.read',
    order: 20,
    count: 'box-office.refunds-awaiting',
  }],
},
```

| Field | Type | Meaning | Status |
| --- | --- | --- | --- |
| `id` | `<module>.<name>` | Unique. Its label is the translation key `<module>.navigation.<name>.label` | Draft 1 |
| `shell` | `account`, `members`, `console` or `live` | Which menu it joins. `account` is My account in the public shell; `live` is a tile on the Tonight hub | Draft 1; this is the list workstream 1 left to this workstream |
| `to` | Address | Must sit under the shell's prefix and the module's id | Draft 1 |
| `icon` | Bundled icon name | Shown beside the label | Draft 1 |
| `ability` | One ability, or a list meaning any of. Never a fact: a fact shows an entry by being mapped to an ability | Hides the entry and guards the address. Omitted only for `account` entries, which every signed-in person has | Draft 1; "any of" is **new** |
| `order` | Number | Position within its section | Draft 1 |
| `group` | Group id | Console only. Defaults to the module's own group. A module may join another's group (Payments under Money) | **New** |
| `section` | `everyday` or `setup` | Console only. Which half of the group | **New** |
| `count` | Count name | A number shown beside the label, from a count the module registers | **New** |
| `match` | Address prefix | Which addresses mark this entry as current, when not simply `to` | **New** |

- The public shell's own header and footer links are the theatre's, declared in its site folder, not contributed by modules. The public shell takes exactly two things from modules: account sections and public components.
- The route guard resolves an address to the longest matching entry and checks its ability. A page under a shell prefix that no entry covers fails the build, so no screen is reachable only by typing its address.
- A console group is declared once by the module that owns it (`core.navigation-group`: id, order, icon). The platform's own modules use the fixed order in the Shells sub-tab; a theatre's module places itself with `before` or `after`.

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
| `core.account-section` | `to` (under `/account`), `icon`, `order`, optional `count` |
| `core.search-source` | `record` (a record type), `ability`, `route` (the module's search route, returning ids), `shells` (where it may be searched from) |
| `core.quick-action` | `to` or `action`, `icon`, `ability`, `keywords` (a translation key) |

Search results are shown through `core.record-resolver`, so a person, an order and a production all look the same in the palette and the module supplies no markup.

## Page components

A module's pages are built from these. Each fixes the frame described in the Page conventions sub-tab and exposes slots.

| Component | Page type | A module supplies |
| --- | --- | --- |
| `PageList` | List | Columns, filters, row actions, the card fields for phones, the data route |
| `PageRecord` | Record | Title, status, summary facts, actions, its own tabs |
| `PageForm` | Form | A schema and field components; the component decides panel or page |
| `PageSettings` | Settings | Nothing: the module names a settings group |
| `PageHome` | Home | Nothing: cards come through the point |
| `PageSteps` | Steps | Step components and a schema per step |
| `PageLive` | Live | The task area, and which data to keep on the device |

Shared pieces a page may use directly: the confirmation dialog, the refusal panel, the money total, the status badge, the person chip, the date and time display, the empty state, the on-behalf-of banner.

These components, their props and slots are part of the public interface that a theatre's own module may rely on. Changing one is a breaking change listed in release notes.

## Composables

| Composable | Gives a page |
| --- | --- |
| `useViewer()` | Who is signed in, which shells they may enter, what they can do. From workstream 2 |
| `useCan(ability, record?)` | Whether the viewer may do something, for showing and hiding. Never the enforcement |
| `useListQuery()` | Filters, sort and page read from and written to the address |
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

## Events

The interface layer announces none and listens for none. It reads `core.module.switched` (from workstream 1) only to refresh menus on open pages.

## Agreed with workstream 1

Workstream 1 accepted these on 16 November 2026 and is logging them in its formats.

1. Navigation entries gain `group`, `section`, `count` and `match`. `ability` takes one ability or a list, not a fact.
2. The shells a navigation entry may name are `account`, `members`, `console` and `live`. Reserved prefixes are `/account`, `/members`, `/console`, `/live`, `/book`, `/sign-in`, `/setup`, `/api` and anything starting with an underscore; the build refuses a theatre's page under one.
3. The new core points above are declared here and indexed by workstream 1. The shape of `core.public-component` is owned and defined by workstream 3. `/files` is also reserved, for workstream 3. `PageEditor`, the layout added for the form builder, is specified in Page conventions.
4. The build checks that every page under a shell prefix is covered by a navigation entry.
5. A route declared idempotent requires an `Idempotency-Key` header and replays its stored answer. Every refusal has the body `{ code, reason, remedy?, fields? }`, where reason and remedy are translation keys.
