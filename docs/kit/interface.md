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
- A module with settings gets an entry for its generated settings page without declaring one. It sits in the set-up half of the module's own group (the group of its first console entry, or one named for the module), at `/console/<module>/settings` (core's own is `/console/system/settings`, in System), so a module that is off takes its settings page with it.
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

`useConfirm` asks once, naming the act and what it costs; `useUndo` is preferred wherever an act
can be reversed. Browser `alert`, `confirm` and `prompt` are a lint error.

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
  pages light.

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
