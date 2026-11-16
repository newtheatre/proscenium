# Nuxt UI review, second round

Read-only. Nothing in the app is changed by this document.

Reviewed at `next` `f808bda` (16 November 2026), after the four fix PRs from the first round
(`docs/reviews/nuxt-ui.md`) had merged. Nuxt UI is 4.12.2.

## What was read

All 76 `.vue` files under `layers/` (core 61, finance 4, payments 7, plus four layouts). The finance,
payments and access scheme screens and `ProductionPerformances.vue` are new since round one and had not
been reviewed. Nuxt UI's own documentation was read for `InputDate`, `InputTime`, `Calendar`, `Chart`
and `Link`.

Matt asked for three things in particular: date and time inputs, small things such as `ULink` against
`NuxtLink`, and where a chart might look good. Those are findings 1 to 3, 7 and 10.

## Summary

| # | Finding | Size | Priority |
|---|---|---|---|
| 1 | `UApp` has no `locale`, so date and time controls read as American | one line | High |
| 2 | Nine native date and time inputs; no kit field for a date, a date and time, or a range | kit component, 4 files | High |
| 3 | Dates are formatted in 11 places, each with its own `Intl.DateTimeFormat('en-GB')` | kit composable | Medium |
| 4 | New screens brought back what round one removed: 30 `w-full`, 16 raw forms, 11 hand-built lists | 12 files, plus a lint rule | High |
| 5 | Summary figures are a hand-built `dl` three times | kit component | Medium |
| 6 | Five setting kinds fall through to a plain text box (colour, duration, rate, reference, custom) | `PageSettings` | Medium |
| 7 | Four raw `NuxtLink`s and one raw `a` where `ULink` or `UButton` fits | 5 places | Low |
| 8 | Money inputs repeat the same four props; one kit `FieldMoney` | 5 places | Medium |
| 9 | The ledger draws a raw `table` inside a card | 1 file | Medium |
| 10 | Charts: four places one would earn its place now, three to plan for | new work | Suggestion |
| 11 | Smaller replacements (history as `UTimeline`, `USelectMenu` for long lists, tooltips on icon buttons, `loading-auto`) | scattered | Low |
| 12 | Repeated text helpers and button props | scattered | Low |

## High priority

### 1. `UApp` has no `locale`

**Where:** `layers/core/app/app.vue:10`, `error.vue:20`.

`UInputDate`, `UInputTime` and `UCalendar` take their format from the `locale` prop of `UApp`. It is
not set, so they use Nuxt UI's default, `en`: month first (`09/01/2027` for 1 September) and a
twelve-hour clock. `PageForm`'s `date` kind and `PageSettings`' `time` kind have used these controls
since PR 72, so this is already live wherever a module declares one.

**Suggested:** `<UApp :locale="locale">` with `en_gb` from `@nuxt/ui/locale`, chosen from the
`core.locale.language` setting so a fork in another language changes one setting. The same prop sets
the text direction and translates Nuxt UI's own words ("Close", "No results"), which are also American
English today.

This should go in before finding 2, or every new date field inherits the wrong order.

### 2. Date and time inputs

**Where (nine native inputs):**

| File | Lines | What |
|---|---|---|
| `components/ProductionPerformances.vue` | 319, 329, 339 | starts, ends, doors: `type="datetime-local"` |
| `pages/console/programme/closures.vue` | 184, 194 | `date` or `datetime-local`, switched by "Whole days" |
| `pages/console/programme/seasons.vue` | 148, 157 | first and last day: `type="date"` |
| `payments/.../providers.vue` | 450 | payout paid on: `type="date"` |

**What is wrong with them:**

- A native picker looks different in every browser and ignores the app's theme and locale. In this
  review's own screenshots the season dialog showed `mm/dd/yyyy`.
- `datetime-local` works in the *viewer's* time zone. These screens mean the *theatre's* time zone
  (`core.locale.time-zone`), so `ProductionPerformances.vue:47` formats with the Swedish locale
  (`sv-SE`) to get an ISO-shaped string in the theatre's zone, and the server converts back. Someone
  setting up a tour from another country gets no hint which zone they are typing in.
- Two separate inputs for a range (first day, last day) cannot stop the end being before the start.
- None of them can grey out days that are not allowed, although the data exists: closures block
  performances, and a season has bounds.

**Suggested: three kit fields**, so no page converts dates by hand. Each takes and gives the value the
server uses and does the `@internationalized/date` conversion inside (the package is already a
dependency).

| Kit field | Built from | Value in and out | Notes |
|---|---|---|---|
| `FieldDate` | `UInputDate` with a `UCalendar` in a `UPopover` on its trailing button (Nuxt UI's "date picker" example) | `2027-09-01` | `min`, `max`, `unavailable` (a function) |
| `FieldDateRange` | `UInputDate range` with `UCalendar range :number-of-months="2"` | `{ start, end }` | replaces the two-input pairs in seasons and whole-day closures |
| `FieldDateTime` | `UInputDate` with `granularity="minute"` and `:hour-cycle="24"`, holding a `ZonedDateTime` in the theatre's zone | epoch milliseconds | shows the zone's short name as the field's hint when it differs from the viewer's |

`PageForm` then gains `datetime` and `daterange` kinds beside `date`, and `PageSettings` keeps
`UInputTime` for `time`. With these, performances can mark closure days as unavailable in the
calendar itself, which is better than the refusal after saving.

One caution: `UInputDate` is typed segment by segment (day, month, year are separate spin buttons), so
a browser test fills it with the keyboard, not `fill()`. The kit fields should each have one browser
test so modules do not need their own.

### 4. New screens brought back what round one removed

The finance, payments, access scheme and performance screens were written while round one's fixes were
in flight, so they follow the old patterns.

| Pattern round one removed | Now | Where |
|---|---|---|
| `class="w-full"` on a control `app.config.ts` already makes full width | 30 | `ProductionPerformances.vue` (10), `payments/providers.vue` (8), `finance/accounts.vue` (3), `access-scheme/index.vue` (2), six more files |
| Raw `<form @submit.prevent>` in place of `UForm` | 16 | 13 files; three in `ProductionPerformances.vue`, two in `payments/providers.vue` |
| Hand-built bordered list (`ul.divide-y…`) in place of `RecordList` | 11 | `payments/attention.vue` (3), `finance/accounts.vue`, `ledger.vue`, `periods/index.vue`, `payments/providers.vue`, `refunds.vue`, `session.vue`, `ProductionPerformances.vue` |
| `section` + `h2` in place of `PageSection` | 10 | `access-scheme/[id]/index.vue` (6), `account/access/index.vue` (4) |
| `variant="subtle"` on an alert or badge (now the default) | 6 | scattered |
| `definePageMeta({ layout: 'console' })` (now set from the address) | 3 | the three access scheme pages |
| Filters in a `div.flex` at the top of the body, not the `toolbar` slot | 1 | `finance/ledger.vue:83` |

None of the raw forms validates on the client: each disables its button until the required boxes are
filled and shows the server's refusal afterwards, so a person learns of a wrong value only after
pressing save. `UForm` with the route's own schema (as the venue and vocabulary pages now do) gives
the message beside the field as they leave it.

**Suggested:** fix these twelve files, and stop it recurring with a check, since the kit's README
alone did not. `bun run check:conformance` already walks the app; three rules would have caught all
of the above: no `<form` outside the kit's own components, no `class="w-full"` on a `U` form control,
and no element with both `divide-y` and `rounded-lg border` outside `RecordList.vue`.

## Medium priority

### 3. Date formatting

**Where:** eleven `new Intl.DateTimeFormat('en-GB', …)` and one `toLocaleTimeString('en-GB')` across
`ProductionPerformances.vue`, `PageRecord.vue`, `DataBoundary.vue`, `closures.vue`, `seasons.vue`,
`account/access/index.vue`, `access-scheme/[id]/index.vue`, both finance period pages and finance's
`useMoney.ts` (which also holds date helpers, under a money name).

Each hard-codes British English, and only five of the twelve pass the theatre's time zone, so the same
performance can show a different day on two screens for a viewer abroad. `seasons.vue` formats in UTC.

**Suggested:** one kit composable, `useDates()`, giving `day`, `dayLong`, `dateTime`, `time` and
`range`, reading the language and `core.locale.time-zone` once. It is not a Nuxt UI component, but it
is what makes the Nuxt UI date controls and the text beside them agree.

### 5. Summary figures

**Where:** `finance/periods/[id].vue:118`, `payments/session.vue:144`, `components/PageRecord.vue:107`.

Three hand-built `dl` grids of "small grey label over a value", each with slightly different classes.

**Suggested:** a kit `FactStrip` (`facts: { label, value, tone? }[]`), which `PageRecord` uses for its
summary and the two module pages use directly. Nuxt UI has no description-list component, so this is
fair custom markup, but it should exist once. It is also where a small chart can sit beside a figure
(finding 10).

### 6. Setting kinds without a control

**Where:** `components/PageSettings.vue:189-235`.

The kit declares twelve setting kinds (`kit/settings.ts:60-78`). `PageSettings` has a control for
seven. The other five are drawn as a plain text box:

| Kind | Now | Suggested |
|---|---|---|
| `colour` | text box holding `#1d4ed8` | `UColorPicker` in a `UPopover`, with the hex box beside it and a swatch on the button; show the contrast result against its `on` colour |
| `duration` | text box typed as `30m`, `2h` or `14d` | `UInputNumber` joined to a `USelect` of units in a `UFieldGroup`, so nobody has to learn the letters |
| `rate` | text box | two `UInputNumber`s ("10 every 60 seconds") in a `UFieldGroup` |
| `reference` | text box holding an id | `USelectMenu` searching that record type through its `core.search-source` |
| `custom` | text box holding raw JSON | a component the module supplies; a person should never edit JSON by hand |

Branding is a first thing a new theatre sets, and typing a hex code is the first impression.

### 8. Money inputs

**Where:** `PaymentsCloseSession.vue:54`, `payments/session.vue:118`, `payments/providers.vue:424` and
`:436`, `PageSettings.vue:195`.

Each writes `:min="0" :step="0.01" :format-options="{ style: 'currency', currency }"` and converts
between pounds and pence itself (`PageSettings.vue:123`). `PageSettings` hard-codes `GBP`.

**Suggested:** a kit `FieldMoney` over `UInputNumber` that takes and gives minor units and a currency
code, and reads the number of decimal places from the currency as `useMoney` already does. `PageForm`
gains a `money` kind.

### 9. The ledger's table

**Where:** `finance/app/pages/console/finance/ledger.vue:139`.

Each posting is a `UCard` holding a raw `<table>` with a screen-reader-only header and hand-set cell
padding. `UTable` gives the frame, alignment (`meta.class.td`) and the header, and its `expanded` slot
is the shape the list design work is already proposing for "rows that open": one row per posting,
opening to its entries. That would also give the ledger sorting, the search box and export for free
through `PageList`.

## Low priority

### 7. Links

`ULink` is the right default: it is a `NuxtLink` that also carries the theme's link colours, the
`active` and `inactive` classes, a `raw` mode, and renders a `button` when given no `to`. A raw
`NuxtLink` is only needed where none of that is wanted.

| Where | Now | Suggested |
|---|---|---|
| `finance/periods/index.vue:35` | `NuxtLink` wrapping a whole hand-built row | `RecordListItem :to` (finding 4) |
| `finance/ledger.vue:162` | `NuxtLink class="hover:underline"` | `ULink` |
| `finance/periods/[id].vue:179` | `NuxtLink class="underline"` | `ULink` |
| `layouts/console.vue:39` (and `admin.vue`) | `NuxtLink class="truncate font-semibold"` for the theatre's name | `ULink raw`, or leave: this one is being reworked with the sidebar |
| `components/PageForm.vue:257` | `<a href="#id" @click.prevent>` in the error summary | `ULink` with the same `href`; it keeps the in-page anchor and gets the focus ring |
| `finance/periods/[id].vue:142` | `UButton variant="link" class="px-0"` | fine as it is; `ULink` with an icon would drop the padding override |

`SkipLink.vue` is correctly a plain `a`: it must work before anything hydrates.

### 11. Smaller replacements

- **History.** `PageRecord.vue:162` is an `ol` of "what, who, when". `UTimeline` is the component for
  that and gives each entry an icon and a connecting line.
- **Long pickers.** 23 `USelect`s. Those whose list grows with the theatre's data should be
  `USelectMenu`, which can be searched: account and period on the ledger (`ledger.vue:86`, `:92`),
  space on a performance (`ProductionPerformances.vue:308`), season and category on a production
  (`productions/[id].vue:231`, `:238`), where a closure applies (`closures.vue:170`).
- **Icon-only buttons.** 49 buttons carry an `aria-label`; none has a `UTooltip`, so a sighted person
  on a laptop gets no name for the up, down, bin and ellipsis buttons. Wrap them, or add a kit
  `IconButton` that sets both from one `label`.
- **Loading.** 29 `:loading` bindings, each with its own `ref`. `UButton`'s `loading-auto` shows the
  spinner for as long as the click handler's promise is pending, and `UForm` does the same for its
  submit button, so most of those refs can go once the raw forms are `UForm`s.
- **Dialogs.** Fifteen inline `UModal`s with a `v-model:open` and a form inside. The short ones
  (new season, new closure, new production, new account, record payout) are `PageForm` panels waiting
  to happen, as new venue and new vocabulary now are.
- **Lists of sentences.** `access-scheme/[id]/index.vue:70` and `account/access/index.vue:84` use
  `ul.list-disc`. Fine as plain prose, but they would read better as a `UAlert` description or
  `RecordList` rows with a tick icon.

### 12. Repeated helpers and props

- `state.charAt(0).toUpperCase() + state.slice(1)` four times to label a status. Statuses should come
  from the catalogue (`t()`), as finance and payments already do; capitalising an English key cannot
  be translated.
- `x === 1 ? '1 record' : `${x} records`` by hand. The catalogue has plurals.
- `color="neutral" variant="outline"` is written 44 times, and `color="neutral" variant="ghost"
  size="sm"` with `i-lucide-ellipsis` eight times. A kit `RowActions` (`items`, `label`) would replace
  the eight, and the 44 are a sign that the secondary button is the common one: worth deciding whether
  `neutral outline` should be the app's default button, with `primary` asked for.

## 10. Where a chart would earn its place

Nuxt UI 4.12 has `UChart`: line, area, bar and donut. It is built on TanStack Charts, which is an
optional peer dependency (`bun add @tanstack/charts`), and it draws its SVG on the server, so it works
in the Worker with no client-only wrapper. It takes `aria-label` and `aria-description`, a `format`
function for values (so money goes through `useMoney`), and colours from the theme
(`--ui-chart-1` to `-6`).

Two rules I would set before any chart goes in. A chart never replaces a figure: the number stays in
text beside it, because a chart cannot be read by a screen reader or copied into an email. And status
colours stay status colours: sold and free are not green and red unless something is wrong.

**Data that is already there**

| Screen | Chart | Why it helps |
|---|---|---|
| Finance, a period (`periods/[id].vue`) | Bar: income and expense by account for the period, beside the debits and credits figures | The page today is two totals and a button. The treasurer's first question is "where did it come from" |
| Finance, accounts (`accounts.vue`) | Donut per kind, or a small bar in each section header, from each account's `balances` | Shows at a glance which few accounts hold nearly everything |
| Payments, sessions (`sessions.vue`) | Bar across recent sessions: expected against counted cash, with the variance in the tooltip | A till that is short every Friday shows as a pattern, which a list of rows hides |
| Payments, a session being closed (`session.vue`, `PaymentsCloseSession.vue`) | Donut: takings by method, with the total in the `#center` slot | The person closing sees cash against card before counting |

**To plan for as their modules are built**

| Screen | Chart | Why |
|---|---|---|
| Box office, a production | Line: tickets sold by day, one line per performance, against days until opening | The classic sales curve; tells marketing whether a show is behind |
| Box office, a production's performances | Stacked bar per performance: sold, held, free, to capacity | Replaces a column of "84 / 120" with something comparable down the page. In a table row a `UProgress` is the lighter choice |
| Console home | An "information" card with a seven-day takings area chart | `core.home-card` already takes a component; a module can contribute one |
| Site administration, email | Area: sent, delivered, bounced by day | Shows a deliverability problem starting |
| Membership | Line: members over time; bar: joined and lapsed by month | The committee's annual question |

I would start with the period page and the sessions page: the data is in the response already, each is
one component, and they are the two screens that are thinnest today.

## What is right

- The four kit page types are used wherever a screen fits one; no new page bypasses `PageFrame`.
- No raw `button`, `input`, `select`, `textarea`, `img` or `label` anywhere in 76 files.
- Icons are all Lucide through `UIcon` or an `icon` prop.
- The finance and payments screens put every string through `t()`; core's console pages do not yet,
  which belongs to a translation pass, not this review.
- `ULink` is already used correctly inside `PageList` for the row link.

## Suggested order

1. Finding 1 (one line, and it is wrong today).
2. Finding 2's three kit fields and finding 8's `FieldMoney`, with `PageForm` kinds, then move the nine
   date inputs and five money inputs onto them.
3. Finding 4's twelve files and the three conformance rules, with findings 5, 7 and 9, since they
   touch the same files.
4. Findings 3 and 6.
5. Two charts (period, sessions) as a first look, then decide on the rest.
6. Findings 11 and 12 as the files are next touched.
