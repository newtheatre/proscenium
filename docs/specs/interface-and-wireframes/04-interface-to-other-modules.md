# 4. Interface to other modules

The interface layer is part of the core (module id `core`). It owns nine extension points through which modules appear in the shells (`core.navigation-group`, `core.home-card`, `core.record-tab`, `core.account-section`, `core.search-source`, `core.quick-action`, `core.help-page`, `core.on-shift-bar` and `core.tonight-tile`) and draws three owned elsewhere (`core.navigation` and `core.setup-step` are foundations', `core.public-component` is the public site's). It gives modules seven page components, an editor layout, two shared components (`Calendar` and `LiveKeypad`) and a handful of composables. A module never writes its own frame, menu, settings page or home page.

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
- A console group is declared once by the module that owns it (`core.navigation-group`: id, `menu` (`console`, the default, or `admin`), order, icon). The platform's own groups use the fixed orders in the Shells sub-tab; a theatre's module places itself with `before` or `after`. Site administration's groups are `theatre`, `modules`, `access`, `email`, `connections` and `upkeep`, all declared by core; an entry with `menu: 'admin'` names one of them, and Overview alone has no group.

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

The interface layer announces none. It listens for foundations' `core.module.enabled` and `core.module.disabled`, only to refresh menus on open pages.

## Agreed with workstream 1

Workstream 1 accepted these on 16 November 2026 and is logging them in its formats.

1. Navigation entries gain `group`, `section`, `count` and `match`. `ability` takes one ability or a list, not a fact.
2. The field is named `menu`, not shell, because a menu is not always a shell: the menus a navigation entry may name are `account`, `members`, `console`, `admin` and `live`. There are four shells (public, members' area, console and site administration) and a live mode, which is not a shell (integration ruling R-33). `core.home-card` and `core.search-source` take the same `admin` value where they name a menu or a shell. A setting may declare `scope: 'site'` (default `'module'`), which draws it at `/admin/settings` in place of the module's console settings page; the declaration is foundations'. The whole reserved list, the same as foundations', is `/account`, `/members`, `/console`, `/admin`, `/live`, `/book`, `/sign-in`, `/setup`, `/api`, `/files`, `/mailing`, `/forms`, `/whats-on`, `/shows` and anything starting with an underscore; the build refuses a theatre's page under one.
3. The new core points above are declared here and indexed by workstream 1. The shape of `core.public-component` is owned and defined by workstream 3. `/files` is also reserved, for workstream 3, and `/mailing` for communications' public confirm and manage pages, which are reached by token with no sign-in and drawn in the public shell. `PageEditor`, the layout added for the form builder, is specified in Page conventions.
4. The build checks that every page under a shell prefix is covered by a navigation entry.
5. A route declared idempotent requires an `Idempotency-Key` header and replays its stored answer. Every refusal has the body `{ code, reason, remedy?, fields? }`, where reason and remedy are translation keys.
