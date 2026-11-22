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
| Admin | `/admin` | people holding the ability of at least one admin entry; it has no ability of its own, and is not found for anyone else (R-33) |
| Live mode | `/live` | people holding the ability of at least one live entry (a tile on the Tonight hub); not found for anyone else. A layout, not a shell: see "Live mode" below |

Every shell and live mode wear the brand (C-35): `app.vue` puts the brand's stylesheet (primary,
greys, radius, already shaded to reach 4.5 to 1 in light and dark) in the head of every page, so a layout
never loads it itself, and each header draws the theatre's logo, or its name when there is none, with
`BrandMark`. The heading font (`core.brand.display-font`) is the public shell's alone: `layouts/default.vue`
sets `public-shell` on `body` and `main.css` gives its `h1` to `h3` and the header's name
`--brand-display-font`; the other shells keep the system font. The choices are font stacks the device
already has, so nothing is downloaded. Fonts the site serves itself and remote fonts (such as Google
Fonts) are not supported yet; adding one means a choice with a source as well as a stack, and a
`@font-face` or stylesheet link from `themeCss`.

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
- Admin is grouped like the console. Its six groups are declared by core with
  `menu: 'admin'` on `core.navigation-group`, in a fixed order: theatre, modules, access, email,
  connections, upkeep. Every admin entry names one of them; only the shell's Overview, `/admin`
  itself, has none.
- `section` is `everyday` or `setup`; everyday entries come first in a group.
- An entry shows only to someone holding one of its abilities (or any signed-in person, for an
  account entry with none). `match` widens the addresses an entry covers.
- Every page of settings gets an entry without declaring one (see "Pages of settings" in the kit
  README). A module's own page of settings is the Settings tab of its page in Admin
  (`/admin/modules/<module>`), so a module that is off takes its settings with it. No page of settings
  is made in the console: staff there open the tab from the cog. A declared page's entry sits in
  the group its `settingPages` entry names. The entry is open to anyone who may change one of its
  settings.
- **A module's page in Admin.** Any admin entry at or below `/admin/modules/<module>` is a tab of
  that module's page (`moduleTabOf` in `shared/navigation.ts`), never a sidebar entry: its pages of
  settings, set-up screens a module puts there, and About (generated for every module, open to
  `core.modules.manage` and `core.health.view`). The tabs do not entitle anyone to Admin, so console
  staff stay out of it. `GET /api/core/modules/:id/tabs` lists the tabs the viewer may open.
  `ModuleFrame` draws the page: the list of modules on the left at 1024 pixels and wider, the
  module's toggle, and the tabs, which scroll sideways on a phone. What the module does is said on
  About, on a module that is off and on one with no other tab, not above every tab. For a week
  after a module is switched on its first tab and About carry a "Set up" card: each step names
  the job ("Check the settings", "Set up Price lists"), a screen is ticked once it has been opened
  on this device, and on a phone the card starts folded to its count ("1 of 3 done").
- **Set-up screens** (things done once or rarely) are tabs too: a module declares the entry with
  `menu: 'admin', group: 'modules', to: '/admin/modules/<module>/<screen>'` and puts the page (and
  its record pages) under `pages/admin/modules/<module>/`. The admin layout draws `ModuleFrame`
  round any page under `/admin/modules/<module>`, and `PageFrame` inside it draws an embedded
  screen (`EMBEDDED_FRAME`): a heading row with the way back, status and primary action, no panel.
  Someone who may open the tab but not Admin is sent by the guard to the console's settings window
  for that address (`decision: 'redirect'`). Redirect a moved screen's old console address in the
  layer's `nuxt.config.ts` `routeRules`.
- **The console's cog.** The cog on a console page opens the settings window for that page: the
  tabs from modules' pages in Admin (pages of settings and set-up screens, less About) that belong
  there, as far as the viewer may open them. `ShellTools` shows the cog when there are any, adding
  `?settings=<entry id>`; `GET /api/core/settings-window?for=<entry id>` lists the tabs and the
  window's name. Which tabs belong where is one rule, `settingsIn`:
  - A tab that names nowhere belongs on every console page of its own module, so a module whose
    console pages sit in one group needs nothing.
  - `settingsIn: [...]` lists console entry ids (`core.productions`) or console group ids
    (`membership`) instead. Declare it on the tab's navigation entry, on a declared page of
    settings (`settingPages.<page>.settingsIn`), or once for a whole module in its manifest (a
    module with no console pages of its own, such as membership fees, names the group it serves).
    The entry wins over the page, and the page over the module.
  - The window is named after the module when it holds only the page's module's tabs and that
    module's console pages sit in one group (Payments settings); otherwise after the page's group
    (Programme settings, Membership settings). Another module's own Settings tab is named after
    that module.
  `?settings=<module>` (an Admin address opened from the console, or settings search) is every tab of
  that module. `ModuleSettingsWindow` (in the console layout) draws the tabs in a window as wide as
  the settings cards: `?screen=<address in Admin>` names the open one, and `NuxtPage` draws that
  address's page with `EmbeddedScreens window` round it. While the window is open, the console
  layout keeps a link to a module's address in Admin, or a screen changing its own query, inside
  the window. Settings search sends console staff to `/console?settings=<module>` and
  administrators to the page in Admin.
- `GET /api/core/settings?page=<id>` gives one page's settings and `?screen=<address>` the ones a
  bespoke screen manages; each item names its `page` or `screen`. The older `?module=x` and
  `?scope=site` answer for one release, `scope` now meaning where the setting's page is.
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
  summary, a Reset to default, who may change each (said only to someone who may not), and a tag where a content page quotes it.
- **KeysCard**: the keys a page manages, by name, as one section: where each comes from now
  (saved here, saved for the whole site, or not set); a set key's field shows dots between its prefix and last
  four characters (`sk_live_••••4242`) until Replace opens it; Remove; and Save
  keys, which asks the person to confirm it is them. **PageSettings** draws its default slot beneath
  the settings, so a settings page puts its KeysCard there. See the kit's "Secrets and keys".
- **PageSteps**: a guided flow with Back, a summary that names the act, and progress kept on the device.
- **PageFrame**, **DataBoundary**, **EmptyState**, **PageFailed**, **RefusalPanel**, **StatusBadge**:
  one title per page, load and fail states, refusals shown from the standard body.

Every page type sits in **PageFrame**, and a page that fits none of them uses it directly. In the
console it is the page's own dashboard panel: the title in the top bar, with the search button and
account menu (**ShellTools**) beside it; elsewhere it is a page header in a container. Its slots are
the same in both: `status` beside the title, `primary` for the page's main action, `toolbar` for
filters under the top bar, the default slot for the body and `footer` for the buttons that act on
the whole page, which stay in view while the body scrolls. `width` is `reading`, `standard` or `full`.
On a phone a page below another shows its parent's name above its own title (the last entry of `trail`),
so "Responses" says whose. The console body scrolls inside its own padding: something that sticks to
the top of it uses `top-0`, not `top-4`.

Inside a page, **PageSection** is a titled card (`title`, `description`, and `actions` and `footer`
slots) and **RecordList** with **RecordListItem** (`to`, `icon`, `name`, `description`, `muted`) is a
bordered list of records. Use these two for headings and lists; do not hand-build either. A row's `below` slot
holds what belongs under it (a short form, a detail). A row that is a link takes a second link or a
button in its `trailing` slot, which is drawn beside the link and never inside it; `label` gives the
link a fuller accessible name than its visible words; `align="start"` keeps what the row ends with level
with the name when the description runs to several lines. A RecordList that fills a PageSection is
`flush`: no border of its own inside the card's. **FactStrip** (`facts: { label, value }[]`) is the
row of figures on a record's summary and on a screen's totals; its columns follow the width of what
holds it, and a long value takes two columns. **FieldGroup** (`title`, `description`, `first`) is a
titled group of fields inside one form or card: a real heading, with a rule above every group but the
first, and an `actions` slot beside the heading. **FilterPanel** (`count`, `v-model:open`, `clear`) is the Filters button for a screen that is not
a PageList: a popover on a laptop, a drawer on a phone, ending in "Clear all" and "Done", with the
screen's own fields in its slot. **TabStrip** wraps a row of tabs that scrolls sideways and fades the
edge that has more. **EmptyState** takes one `action` (`label`, `to` or `onClick`, `icon`) for the usual
single button, or the `actions` slot for more.

A first load that fails shows the reason and "Try again"; when the answer is one a retry cannot change
(not found, not allowed, gone) it shows the way back instead: the page's parent, or the address one step up.

A list the user puts in order is a **SortableList** of **SortableRow** (`id`, `index`, and RecordListItem's props), built on
`@dnd-kit/vue`. A row's handle is the element with `data-drag-handle` in its `leading` slot; the list emits
`reorder({ id, from, to })` and the page reorders its own array. Every slot of the item passes through, so a row
can hold an inline rename in `name` or a short form in `below`: only the handle drags. Dragging has its own keyboard (Space, arrows, Space), but give
the row arrow keys on the handle and Move up and Move down in its menu too (see Ticket types).

`bun run check:conformance` holds screens to this ("Screens are built from the kit"): no raw `<form>`
(use `UForm` or `PageForm`), no `w-full` on a form control (controls already fill their field), no
hand-built bordered list, no native date or time input, no date formatted by hand, no form without
`novalidate`, and no native `required` on a control.

## Checking a form

A form is checked by its schema, never by the browser, so every problem shows beside its field in the
app's words, and says what the server would say for the same value.

- **Every `UForm` carries `novalidate`.** Keep `type="email"` and `type="url"` on inputs for the
  keyboard they bring up; `novalidate` stops the browser's own bubble. `required` goes on the
  `UFormField` (it draws the mark), never on the control.
- **Pass the route's schema** (`:schema`), imported from the module's `server/input.ts` or a
  `shared/` file, which must not import server code. A form that holds `''` for an empty field where
  the route takes `null` wraps it: `blankAsNull(productionPatch)` (`shared/validation.ts`).
- **Name each `UFormField`** with the body's key (`name="externalBookingUrl"`), so the schema's
  message, and the server's, land on it.
- **Show what the server refuses beside the field.** On a failed save,
  `form.value?.setErrors(fieldErrors(refusal))` (`useRefusal()`); `RefusalNotice` keeps the summary.
  `PageForm` does all of this itself.
- **Field errors always; a summary only on a long form.** Every problem shows beside its field. A
  form long enough to be a page adds a "Please check" summary at the top that links to each; a short
  form in a panel or a dialogue shows the field errors alone.
- **Submit verbs.** A record with a page of its own is made with "Create <thing>" (Create production,
  Create venue, Create role); something added to a list is "Add <thing>" (Add season, Add space, Add
  closure). Its toast says "<Thing> added", with Undo where the act can be reversed.
- **Do not disable the save button until the form is valid.** Let it be pressed and say what is
  missing. A form with no schema of its own names what it needs with `needs()`:
  `:validate="() => needs({ name: form.name, note: paid ? form.note : true })"`, each key the
  `name` of its `UFormField`; `true` stands for a field not needed just now. Disable a button only
  for something no field can fix (a lookup still loading, a till locked).
- **Messages** come from `core.form.invalid.*` (`i18n/en-GB/validation.json`), installed for every
  schema on both the app and the server, so zod's own wording ("Too small: expected string to have
  >=1 characters") never reaches a person. A message a schema writes itself still wins.

`useConfirm` asks once, naming the act and what it costs; `useUndo` is preferred wherever an act
can be reversed. `useUndo().offer(message, undo)` is the success toast with an Undo button for ten
seconds: `undo` does the reverse act (move a record back to the state it was in, patch the old
values back, delete what was just added, add again what was just deleted), then the toast says
Undone, or why it could not be. Use it in place of a plain success toast wherever the reverse act
exists; Seasons is the worked example. Browser `alert`, `confirm` and `prompt` are a lint error.

**A sign-in that is not strong enough.** An ability that needs a strong sign-in refuses a basic one
with one of two codes, both 403: `core.access.needs-strong-sign-in` when the account has a passkey
(or an accepted authenticator app) that was not used, and `core.access.two-step-not-set-up` when it
has neither. `$api` confirms the first in place and sends the request again. The second cannot be
confirmed: an act opens a dialogue that says "This needs two-step sign-in" with "Set it up", and
`RefusalNotice`, `RefusalPanel` and `DataBoundary` show the same link (`refusalAction(refusal)`, to
Sign-in in My account), so a screen needs nothing of its own. A route that makes its own check with
`can()` and refuses `core.access.denied` is answered with the sign-in refusal when that was what
stood in the way, so do not word "no permission" yourself for it. In the console and Admin
`StrongerSignInNotice` (drawn by PageFrame) tells someone in this position before they try, from the
viewer's `strongerSignIn` (`set-up` or `confirm`); `/api/core/me` carries the same field.

A short list that needs a search only now and then takes `SearchToggle` beside its primary action:
an icon that opens into a search box. Bind its `v-model:open` and, while it is open, give the
primary button `:ui="{ label: open ? 'max-sm:sr-only' : '' }"`, so on a phone the button drops to
its icon and both stay on one row. Archived or finished records go below the others under a
`CollapsibleDivider` (label and count, closed until opened), so the list shows what is current.

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
  `core.members-area.name`. The home shows only the cards modules put on it; the bar is the way to
  each section, so the home repeats none of them, and with no card it says nothing needs the person.
- **My account** (`/account`): the same pages for everyone signed in. On a laptop every account page
  sits beside the account's menu (`AccountNavigation`, drawn by `PageFrame` for any address under
  `/account`): an Overview, then the `core.navigation` entries with `menu: 'account'` in two groups,
  `group: 'theatre'` (the person's life at the theatre, and the default) and `group: 'account'` (the
  account's upkeep), in that order (`ACCOUNT_GROUP_ORDER`). An entry may name an `attention` count:
  above zero the entry carries a warning badge on every account page. A page's trail back to My
  account shows only on a phone, where the menu is folded away.
- **The overview** greets the person, then shows what needs them, then their life at the theatre
  as cards. What needs them comes from `core.account-notice` (a code point; each source's
  `notices(actor)` returns notices with a tone, an icon, title and description by translation key
  with `params`, and an optional `to` with an `action` label; a source that fails is left out).
  The cards are `core.account-section` contributions (`target`, `side`, `ability`, `component`,
  `order`, optional `to`, `icon`, `count`, `hideEmpty`): the `component` is the file name of a
  component in the module's `app/account-sections/` folder; it receives `headingId` and draws itself
  with the kit's `AccountCard` (title, a one-line description of how it stands, an optional status
  word, the way in). Below the cards the overview lists, by group, every account entry no card
  already leads to, on a laptop as on a phone (where it stands in for the folded-away menu). A
  module that is off leaves nothing behind.
- **Counts**: a module registers one through `core.count` (a code point; the contribution's `value(actor)`
  returns a number; a count that fails reads as zero). An entry or section names it with `count`, and
  with `hideEmpty` it is left out while the count is zero. The address of a hidden entry still opens.
  Passes (no pass held) and Notifications (no kind of message to choose) are hidden this way.
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
- **Tabs, one style per level.** Tabs that divide a page (a record's tabs, a module's page in Admin,
  the settings window, a list's views) are `UTabs` with `variant="link"`: underlined, each label in
  full, scrolling sideways when they do not fit rather than truncating. Filled pills are for a control
  inside a part of a page (a till's panels), never for a page's own tabs. On a phone a record's name
  takes a line of its own under the console's bar (`PageFrame`'s `longTitle`).
- **Width and hydration.** The server cannot know the width, so markup chosen by width is drawn both
  ways and picked with CSS (`lg:hidden`, `max-lg:hidden`). Where it cannot be, `useScreenQuery` answers
  false until the page has hydrated, so the browser's first render matches the server's.
- **`PageHome`** (UI-16): a queue. Cards come from `core.home-card` (`{ id, home, ability, component,
  urgency, count? }`), components in the module's `app/home-cards/` folder that receive `count`. They
  sort overdue, today, information; a card whose count is zero is absent. With nothing waiting the page
  says so and offers up to three of the viewer's quick actions. The members', Tonight and Admin homes
  use it.
- **`ConsoleHome`** (UI-16): the console's home. Top to bottom: the queue (`HomeCards`, only when
  something is waiting, with no empty panel otherwise); up to six of the viewer's quick actions
  (`core.quick-action`, by `order`); then a grid of headline figures from `core.home-figure`. A figure
  is code (`server/points/home-figure.ts`): a `label`, an `ability` held anywhere on the site, an
  `order`, a `size` (`small` one cell, `wide` two side by side, `tall` two stacked) and a `read(actor)`
  that answers `{ value, unit?, detail?, chart? }`. A `unit` that is a currency code makes the value
  money in minor units; `percent` a whole percentage. A chart is `bar`, `line` or `area` over rows
  named by `date`, `month`, `at` or `label`, drawn by `ChartFigure` (quiet: the tile's words name it),
  or `meters`, a list of rows each a share of its own `max`. A figure that takes longer than two
  seconds or throws is left out, and a module that is off adds none, so an install without the bar
  shows no bar tile. A chart whose every value is nought is not drawn: the figure already says so. The empty state shows only when there is nothing at all to put on the page.

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

### Small parts

- `IconButton`: a button that is only an icon. Its one `label` is the accessible name and a tooltip,
  so a person with a pointer is told what the arrow or the bin does. `bun run check:conformance`
  refuses an icon-only `UButton`.
- `RowActions`: the ellipsis menu a row or a record ends with. It takes `items` and a `label`
  ("Actions for Hamlet") and draws nothing when there are no items.
- A status is named by the catalogue (`core.states.draft`), never by capitalising its key, and a
  count comes from the catalogue's plural (`core.counts.records` with `count`).
- A select whose list grows with the theatre's data (accounts, periods, spaces, seasons) is a
  `USelectMenu` with `value-key="value"`, which can be searched. A short fixed list stays a `USelect`.
- A button whose click handler is `async` takes `loading-auto` in place of a flag of its own.
- History is a `UTimeline`.

### Charts

`ChartFigure` wraps Nuxt UI's `UChart` (TanStack Charts, drawn as SVG on the server, so there is no
client-only wrapper). It takes a `title`, which is the caption and the chart's accessible name, and a
`summary`, one sentence that says what the chart shows and is read out in place of it. Both are
required. Then `data`, `index`, `categories`, and a `format` for values, such as `money` from
`useMoney`.

Two rules:

- **A chart never replaces a figure.** The numbers stay in text beside it, in a `FactStrip`, a table
  or a list, because a chart cannot be read by a screen reader or copied into an email.
- **Status colours stay status colours.** A chart uses the chart colours `ChartFigure` sets. Sold and
  free are not green and red unless something is wrong.

A chart with one bar says nothing a figure does not, so show one only when there are at least two
things to compare. Rows that share a name along the bottom are drawn as one: give each its own.

### The calendar

`CalendarBoard` is the shared calendar (UI-35). Every module that shows time draws it, never its own:
the programme calendar (C-13) first, then Spaces' bookings, the front of house rota and training
sessions. It takes:

- `view`: `month`, `week`, `day` or `list`.
- `days`: the operating days drawn, in order (42 for a month, 7 for a week, 1 for a day). The page
  works them out from the theatre's first day of the week (`core.organisation.week-start`).
- `items`: `CalendarItem`s. Each names the operating day it belongs to (`day`, and `lastDay` for one
  over several days), its times or none for all day, the day view's `column`, a colour from 1 to 8,
  its state as `{ label, edge }`, and where acting on it goes (`to`).
- `columns`: the day view's columns, such as spaces. An item with no column spans them all.

It emits `day` when a day is chosen, to open the day view.

Four rules:

- **Place by operating day.** Give each item the operating day the server worked out, so a show at
  00:30 sits with the evening before and is drawn once.
- **State three ways.** Each block shows its state as a word, an edge (solid, dashed, dotted or
  double) and a colour, so nothing rests on colour alone. The state most blocks are in is marked
  `usual` (a scheduled performance): its word is still read out but is not drawn, so a Draft or a
  Cancelled block stands out (Matt, 21 November 2026).
- **Name a calendar colour, never a value.** `calendar-1` to `calendar-8` are set in `main.css`,
  apart from the brand and the status colours, with a fill, text and edge for light and dark.
- **The list is the equal route.** The List view holds the same items. It is the one shown at phone
  width for the month and week, and the day view shows one column at a time there, chosen from a
  menu. It shows the window the calendar is showing, not a paged list: a module that needs filters,
  sort or export over a longer period adds a `PageList` of its own.

### Controls for the setting kinds

The generated settings page gives each kind of setting its own control, and the same fields are there
for any other screen:

- `integer`: a number box with steppers, kept inside the setting's `min` and `max`.
- `money`: `FieldMoney`.
- `duration`, and the period of a `rate`: the kit's `DurationInput`, a number and a unit from seconds
  to years. It takes and gives whole seconds and offers only the units the setting's limits allow, so
  nobody types `30m` by hand.
- `colour`: `FieldColour`, a swatch that opens a picker beside the hex value.
- `reference`: `FieldRecord`, which searches the record type's `core.search-source` and keeps the
  record's id. A record type nothing searches falls back to the id as text.
- `list` of text: tags (`UInputTags`), a value kept when it is typed and left or pasted. A list that
  names a `choices` route (a GET answering `{ items: { value, label }[] }`) is `FieldListChoices`
  instead, a multiple `UInputMenu` of those values, such as the policies a site has.
- `list` of choices: square ticks, or a searchable multiple `USelectMenu` once the list is long.
- `custom`: a component in the module's `app/setting-editors` folder named for the key, so
  `finance.year.starts` is `SettingFinanceYearStarts.vue`. It takes `modelValue` and `disabled` and
  emits `update:modelValue` with a value the setting's schema accepts. Without one the value is typed
  as text.
- A date control is typed part by part, so a browser test focuses its first part and types the digits
  (`tests/e2e/date-fields.spec.ts` covers the kit fields; a module need not test them again).

## Choice fields in forms

PageForm's `radio` takes `options: [{ value, label }]` (values may be numbers) and shows one group
with the field's label as its legend. `ticks` takes `options` and, if short notes are allowed,
`notes: { max, label }`; its value is an array of `{ value, note? }` for the ticked options, in the
order of the options, and a note box opens under a tick only when `notes` is given.

A `checkbox` shows its `help` under its own label. A field with `showIf` is a follow-up and is set in
under the question it follows. A long form can be divided into parts: `heading: true` on a `radio` or
`ticks` field draws its question at heading size (an `h2` in its legend), as the head of the first
part, and `section: '<heading>'` on a field draws a divider and that heading (an `h2`) above it. The
access scheme's application form does both.

## Admin (R-33)

The fourth shell, at `/admin` (menu value `admin`). It holds install-level screens; the console keeps
day-to-day work and each module's own settings. Someone enters it by holding the ability of at least
one admin entry (the viewer then has the side `admin` and the account menu shows "Admin");
anyone else finds `/admin` is not there. The layout is `layouts/admin.vue`: the console's frame with an
"Admin" mark at the start of every page's navbar that says where you are at every width (PageFrame
draws it when the layout provides `ADMIN_SHELL`; there is no second bar, and below 1024 pixels the
navbar's own menu button opens the drawer), a "Back to console" (or "Back to the site") row where the theatre's mark is,
the same primary colour as the console (the brand's, as in every shell, C-35), so a control looks the same in either shell and in the
console's settings window (the `admin-shell` class on `body` is kept as a hook), and a browser title
that starts "Admin". A page uses it with `definePageMeta({ layout: 'admin' })`.

- **Overview** at `/admin`: `PageHome` with `home="admin"`, cards from `core.home-card` with `home: 'admin'`.
- **Pages of settings**: Theatre, Branding, Sign-in, Privacy and Advanced, each `PageSettings
  page="core.<page>"`. There is no catch-all page; `/admin/settings` redirects to Theatre. Settings
  search and the palette link to each setting's own page or screen.
- The palette offers both shells' screens to someone entitled to both, each named with its shell.
- Moving a screen from the console's System group: give it an admin entry (`menu: 'admin'`, a group
  from `ADMIN_GROUP_ORDER`), move its page under `pages/admin/`, and add a redirect from its old address
  in `layers/core/nuxt.config.ts` `routeRules`.

## Live mode

Live mode is for one job done standing up: the door, the till, the tonight board, a checklist. It is
a layout, not a shell, and it has no navigation of its own.

- **Entering it.** A module adds a tile to the Tonight hub (`/live`) with a `core.navigation` entry
  whose `menu` is `live`, and the entry's `ability` decides who sees the tile and who may open the
  screens under its address, exactly as in the other shells. An ability held through a fact (such as
  being on shift) counts. Whoever holds the ability of at least one live entry gets the `live` side in
  the viewer and "Tonight" first in the account menu; for anyone else `/live` does not exist.
- **The Tonight hub** (`/live`) lists the performances of the theatre's operating day (so a show
  that runs past midnight stays until `core.locale.day-start`), each with its start time and the
  figures modules give for it through `core.tonight-figure` (`label`, `ability`, `order`,
  `read(performanceId)` → `{ value, state, unit?, to? }`; a currency `unit` makes the value money in
  minor units): Box office gives sold, not yet paid, in, still to come and seats left, Payments
  what the tills have taken. The hub reads them again every 30 seconds while open. On a day with
  no performance the route also answers `next` (the first scheduled performance after today) and the
  hub says "Next: The Lighthouse Keeper, Sun 22 Nov, 19:30, Main house". The screens' tiles follow. Someone whose only work is in live mode who opens the console is sent here.
- **The layout** (`layouts/live.vue`, applied to everything under `/live`): full screen, dark unless
  the person picked a mode themselves, and every button at least `--proscenium-target-live` (48
  pixels) square.
- **PageLive** is the page type: `title` and `context` (both already translated, for example the
  screen and the performance), an optional `back` address, the task in the default slot and a sticky
  `footer` slot. Its status strip shows the title, the context, whether the device is online and the
  way out: an arrow back to the Tonight hub from a screen, and on the hub a worded "Leave" button
  (named "Leave live mode") back to the console, members' area or My account.
- **The till** (`/live/till`, Payments) is the combined till for show nights: every
  `payments.desk-basket` panel the seller may use, as tabs over one basket and one payment.
  `?only=box-office` (a comma list of modules) narrows it to those panels, which is how the
  console's Sell screens open it on a phone. A till with one panel draws no heading over it. A panel
  may give a short `tab` label, an `icon` and a larger `livePanel` component for it. The sale is
  one receipt beside the panels, grouped by panel, with the ways to pay on it: one press makes the
  sale and starts that way of paying, and Split takes it in parts. On a narrow screen the receipt is
  a sheet, opened from a bar at the foot that also takes payment; the bar appears once the sale has
  a line. Clear empties the sale and toasts with Undo. "Still to pay" shows only once part is paid,
  and a payment in progress has one way out, Cancel sale. The sheet swipes down to close; its
  body scrolls only when the sale is too long to fit (a scrolling box takes a swipe as a scroll).
  Codes and discounts go in one box on the receipt, not a window: typing offers "Use code", the
  box's list holds the discounts the seller may give, and one that asks for a reason shows a Reason
  field under it. A removed code or discount toasts with Undo. A panel is shown on the receipt by
  the lines of its `summarise`; one that wants steppers on its lines, or them shown before the
  server has answered, emits `receipt` with `{ lines, note?, added? }`: each line is
  `{ key, label, detail?, quantity, amountMinor, more?, fewer? }`, `note` is a line that stays under
  them with an optional action (the bar's age-check answer and "Change"), and `added` is
  `{ label, undo }` for the foot bar's "Added: … Undo". The total is always the server's. The console
  keeps narrowed tills: `<PaymentsTill :modules="['box-office']" />` on Box office's Sell, and the
  "Your session" card on Money › Sessions has an "Open the till" button rather than a menu entry.
  The first sale at a till opens the seller's till session, so coming to a till by mistake leaves no
  session behind. It opens at the place the device used last (else
  `payments.sessions.default-space`, else unknown), which the strip above the till can change before
  or after; the seller's own session is the "Your session" card at the top of Money › Sessions, not a
  page of its own.
- **Offline.** A live screen that must keep working without a connection reads through
  `useLiveData(key, url, { every? })`: online it fetches and keeps a copy in browser storage, offline it
  answers from that copy (with `at`, when it was made), and `update()` changes the copy for what was
  done offline. Copies older than a day are dropped. Writes go through `useLiveQueue(key, send)`:
  `add(item)` keeps the item on the device and `send(items)` is called with everything waiting when
  online, oldest first; a batch whose answer was lost is sent again unchanged, so give each item an
  id the server recognises (the door's scans carry ids made on the device). The strip shows how many
  writes are waiting on every queue. The door (`useOfflineDoor`) is the first user: it checks signed
  door codes against the public keys on the device. A screen without them still cannot send changes
  offline and should disable its writes rather than lose them. Pages are not cached for offline
  loading, so a screen must be open before the connection goes.

## The public show page and what's on

A show's page opens with the same dark band as the spotlight at the top of what's on (concept A,
"Spotlight", chosen by Matt on 19 November 2026): the poster, the title, four facts (dates, running
time, tickets, guidance) shown only when known, the venue, and the next few dates as buttons
(`PublicSiteDateButtons`), each opening the booking drawer when the booking answer names one. On a
phone the poster sits small beside the title, so the title, the facts and Book are on the first screen.

A theatre restyles the band with CSS rather than copying the component. The hooks are
`public-show-top` (the band), `public-show-poster`, `public-show-title`, `public-show-actions` and
`public-show-book` on the show's page, and `public-spotlight`, `public-spotlight-poster`,
`public-spotlight-title` and `public-spotlight-book` on what's on.

## The public header's extra items

A module may put something of its own in the public header beside the account menu, such as box
office's "Tickets held 8:41" while a basket is held. It names a global component from a plugin:
`usePublicHeaderItems().value = [...usePublicHeaderItems().value, 'BoxOfficeHeldTickets']`.
`layouts/default.vue` draws each name it can resolve and leaves out the rest. The component draws
nothing when it has nothing to say. On a phone, while such an item shows a link, it takes the place of
the signed-out Sign in icon, which the menu repeats.

## Seams for Identity

Until Identity lands, `layers/core/server/interface/viewer.ts` describes the viewer from the
actor: `{ signedIn, name?, sides, navigation }`. Components only read that, never a role or an
ability. Sign-out posts `{}` to `/api/core/sign-out`; the sign-in page is read with `?next=`.

## Testing it

`bun run test:browser` builds with `PROSCENIUM_GALLERY=1`, which adds the gallery fixture module
(sample list, form, steps, feedback and denied screens, plus a header-based test sign-in), and runs
Playwright with axe in light, dark and phone widths. Contrast, hydration and rate limits are
all exercised there; the tests use one worker because they share a local database.

### The console's and Admin's sidebars

One menu: each navigation group of two or more entries is a collapsible section (open when it holds
the current page), a group of one entry is a plain link, and there are no "Everyday" and "Set up"
headings (everyday entries come first). The sidebar is resizable as well as collapsible (Nuxt UI's
dashboard sidebar; the width is kept in a cookie). The foot holds a Documentation link (a placeholder
pointing at the repository's docs until screens have help pages), a Admin link for anyone
who holds an admin entry, and the account menu. In Admin the theatre's mark sits where it
does in the console and "Back to console" (or "Back to the site") sits at the foot instead of the
Admin link. The navbar keeps only search.
## Lists: defineList, filters, sort and columns

A list is declared once and read by the page, the data route and the export. The declaration is
pure data in `layers/core/shared/list.ts` (the kit's `readList` and `defineListSource` import it and add
the SQL side). `defineList(id, { filters, sorts, columns, search, views, defaultView, defaultSort, subRows })`
keeps filter and sort keys literal and refuses a reserved key (`q`, `sort`, `order`, `page`, `size`,
`view`), an undeclared sort or a view naming something undeclared.

`PageList` takes `:list` (a declaration) and, for a choice filter whose options are the theatre's own
(seasons), `:filter-options="{ seasonId: [...] }"`. A page that still passes `columns` and `filters`
gets the same declaration made for it: each filter is a `choice`, each `sortable` column a text sort
(`sortType` words it as numbers or dates). `description` is one line under the title saying what the list
holds. The `before` slot is drawn above the view tabs, so what the page shows first is not parted from
its title by them. An empty list says so once: its primary action stays in the title bar and is not
repeated in the empty state.

- **Toolbar:** search (always first, across every field), **Filters** with a count, **Sort**, **Columns**.
  Filters opens a popover on a laptop and a drawer on a phone, one labelled field for each filter, in six
  kinds: `choice`, `choices`, `grouped`, `lookup`, `dates` (relative presets or two days; days are the
  device's until the theatre's day is passed in) and `yes-no`. Changes made in one visit to the panel make
  one history entry. A chip for each filter that is on opens the panel; its cross is named "Remove the
  filter State: Draft". A view's own preset filters fill the panel's fields but are not chips and are not
  counted on the button: the open tab already says them. Only what the person adds is.
- **Sort** says how the list is sorted ("Sort: Seats, Lowest first") and lists every declared sort, shown or not.
  A heading sorts in its natural direction, again reverses, a third press returns to the default.
- **Columns** ticks optional columns; the choice is kept on the device for each list
  (`core:list-columns:<id>`), is not in the address, and is cleared on sign-out. Below 1024 pixels the
  rows are cards, so the control is not drawn.
- **Cards** (below 1024 pixels) show the row's label as the title, then up to four columns marked
  `card`. A column whose text the title already says (a name, a reference) is left out, so the next
  one takes its place.
- **Paging:** a list that fits on one page says "7 in all" and draws no pager; a longer one says
  "Page 1 of 3, 60 in all".
- **Address:** one key for each filter (`state=draft,published`, `when=7d`, `action=orders.refund`),
  `view`, `sort`, `order`, `page`, `size` (25, 50 or 100), left out when default (for `size`, the site's `core.lists.page-size`).
- **Server:** `decodeList(query, list, { can, today })` (alias `parse`) validates strictly and answers a typed
  `ListQuery` (folded search words, validated filters, dropped filters, view, sort, page, size) or a
  `ListRefusal` naming the key. Routes call the kit's `readList`, not this.

### The server part: defineListSource and readList

The route's side of a list is a source in the module's `server/lists/<name>.ts`, the default export of
`defineListSource(list, { table, filters, sorts, search })`. It binds every key of the declaration, and a
missing or extra binding does not compile:

- **filters:** `{ column: 'key' }` compares the filter's value with a column (a `choices` value with
  `IN`, a `dates` value as a range in the theatre's days, a timestamp column by the instants that
  bound them), or `{ where: value => sql`...` }` writes the condition, a subquery for a child filter.
  A `grouped` filter always writes its own.
- **sorts:** `{ columns: [...], index: 'name' }` names an index on the table that begins with those
  columns, or `{ columns, bounded: n }` says the list's own filters hold the scan to n rows.
- **search:** every column of the list and every extra in the declaration's `search`, bound to a
  text column, to `{ column, ability }` when only some viewers may see it, or to `false` for a field
  that is not text. An encrypted, special or erase-`clear` column is refused. The searched columns
  make the table's search index: `bun run db:generate` writes it into the next migration and the
  check compares.

A data route reads its address with `readList(event, source)` (or `readListQuery(query, source)` in
an export job). It refuses an unknown key with `core.list.unknown` and a page past 10,000 rows with
`core.list.too-deep`, and answers the validated filters, `dropped`, the search `words`,
`ignoredWords` and `searchTooShort` (words under three letters are not searched), the sort, view,
page, `limit` and `offset`, and:

```ts
const read = await readList(event, source)
const rows = await useDb().select(...).from(table).where(read.where()).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
const [{ n }] = await useDb().select({ n: count() }).from(table).where(read.where())
return read.answer(rows, n)
```

`orderBy()` ends with the id. `read.answer(rows, total)` adds `dropped`, `ignoredWords`,
`searchTooShort` and, when there was a search, `matched`: for each row whose words were found only in a
field not shown by default, its id mapped to that field ("Matches Note: …"). It reads rows that carry
`id` and their values under the list's field keys; `read.matched(rows)` gives the same by position.

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
checklist folds to one line above the tabs ("Checklist: 3 of 5"). `aside-below` puts a side panel
that is reference and not the work (a poster) after the tabs on a phone. The summary strip shares one
row evenly on a laptop however many facts it holds (`FactStrip`'s `row`).

### The trail and the way back

`trail: { label, to }[]` (parents only, nearest last) on `PageFrame`, `PageRecord`, `PageList` and
`PageSettings`; `PageFrame` alone draws it and never fetches a label. In the console and Site
administration a `UBreadcrumb` of the parents sits in the navbar after the sidebar toggle from 640
pixels up, and below that an icon-only back button ("Back to Productions") takes its place. Outside
the console a worded back link sits above the title. A link to a list returns the list as it was left
(`useListMemory`, kept for the tab's session). A page passes its own parent once its record has arrived.
On a phone a page with a trail shows its title on a line of its own under the bar, as a record does,
so the back button and the page's actions never squeeze it. `PageForm` takes `trail` too, for a form
that is a page. In a sidebar only one entry is current: the one whose address covers the page most
closely (`resolveEntry`), so Who holds what is not Accounts as well. An entry marked `unlisted` keeps
its address and its ability but is not drawn in the menu: its page is reached from another page (Merges,
from Accounts) and by search, and the menu shows the listed entry above it as current.

`PageList` reads four optional fields of the data route's answer: `dropped` (its chips go), `ignoredWords` and
`searchTooShort` ("Words under three letters are not searched"; "Nothing was searched"), and `matched`
(row id to the hidden column that matched, shown under the row's first cell as "Matches Venue: Studio").

A page can say one more line about the answer through the `#note="{ result }"` slot, drawn above the rows with
`role="status"`. `result` is the whole answer, so any extra field the route sends beside the rows is there: Accounts
sends `hidden: { unclaimed, anonymised }` and says "4 not yet signed in and 2 erased are not shown".
