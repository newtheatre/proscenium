# Settings registry

A setting is declared once, in its module's manifest, with a kind, a default and the ability needed to change it. The settings screen, the validation, the audit entry and the token a public page quotes are all generated from that one entry.

## An entry

```ts
// layers/lost-property/module/settings.ts
import { defineSettings, setting } from '#kit'

export const settings = defineSettings('lost-property', {
  'items.keep-for': setting.duration({
    default: '28d',
    min: '1d',
    max: '365d',
    change: 'lost-property.settings.manage',
    onChange: 'confirm',
    audience: 'public',
    quotable: true,
  }),
  'items.photo-cap': setting.integer({
    default: 3,
    min: 0,
    max: 10,
    unit: 'photos',
    change: 'lost-property.settings.manage',
  }),
})
```

The examples in this tab use the invented lost-property module of the Worked example tab, so that nothing here can be mistaken for a decision about a real module. The full key is the module id plus the short key: `lost-property.items.keep-for`. `defineSettings` adds the prefix, so a module cannot declare a key outside its own name.

## Kinds

The kind decides the control on the settings screen, the stored form and how a token is written out.

| Kind | Written in the manifest as | Stored and read as | A token shows |
| --- | --- | --- | --- |
| `boolean` | `true` | boolean | "yes" or "no" |
| `integer` | `8`, with optional `unit` | integer | "8 seats" |
| `money` | `1250` | integer minor units, in the theatre's currency | "£12.50" |
| `duration` | `'30m'`, `'2h'`, `'14d'` | integer seconds | "30 minutes" |
| `time` | `'04:00'`, with optional `min` and `max` | `HH:MM` in the theatre's time zone | "4:00 am" |
| `rate` | `{ count: 10, per: '10m' }` | a count and a period in seconds | "10 in 10 minutes" |
| `colour` | `'#7a1f2b'`, with optional `on` naming what it sits on | a hex colour, checked for contrast where `on` is given | not quotable |
| `text` | `'Box office'`, with `maxLength` | string | the text |
| `choice` | one of `options` | string | the option's label |
| `list` | an array of `text` or `choice` | array | the items, joined |
| `reference` | none; always starts unset | a record id of the named record type | the record's title |
| `custom` | anything a Zod `schema` accepts | JSON | not quotable |

`custom` is the escape hatch. It needs its own editor component and cannot be quoted, so a specification that reaches for it should say why no other kind fits. There is no floating-point kind: a percentage is an integer with `unit: 'percent'` or `'basis-points'`.

## Fields of an entry

| Field | Required | Meaning |
| --- | --- | --- |
| `default` | Yes, unless `unset: true` | The value until the theatre changes it. Only overrides are stored, so improving a default upstream reaches every theatre that never changed it |
| `unset` | No | The setting ships with no value. Features that need it are blocked with a message naming the setting, never guessed |
| `min`, `max`, `maxLength`, `options` | By kind | Limits, checked on the screen and again where the value is saved |
| `unit` | No | A translation key for the unit of an `integer` |
| `change` | Yes | The ability needed to change it |
| `onChange` | No | `reason`: the person must type why, and the reason is kept with the change. `confirm`: the screen shows what will move and asks again. Unset: the change is simply saved |
| `audience` | No, default `staff` | Who may read it: `public`, `signed-in` or `staff`. Decides whether the browser may ever receive the value. There is no other value |
| `quotable` | No, default `false` | A content page may quote it by token. Requires `audience: 'public'` |
| `sensitive` | No | The value could identify a person. The audit entry records a hash, not the value, and the setting cannot be public |
| `managed` | No | Written only by a sync or a setup step, not by the settings screen |
| `replaces` | No | The key this one was renamed from. The old value is carried over and the old key answers for one major version |
| `since` | No | The release it first appeared in |

Labels, help text and option labels are translation keys derived from the key: `lost-property.settings.items.keep-for.label` and `.help`.

## Rules across settings

A rule that involves two settings is declared beside them, named in the manifest field `settingRules`, and checked on every save and on import.

```ts
export const settingRules = defineSettingRules('lost-property', [
  {
    id: 'remind-before-disposal',
    check: s => s['items.remind-after'] < s['items.keep-for'],
  },
])
```

A failed rule refuses the save and shows the message at `lost-property.settings.rules.remind-before-disposal`.

## Reading a setting

| Where | How | Notes |
| --- | --- | --- |
| Server | `await useSetting('lost-property.items.keep-for')` | Typed from the key. Read once per request, so a change takes effect on the next request and never mid-request |
| Component | `usePublicSettings()` | Returns the settings of audience `public`, and only those. A component that needs a `signed-in` or `staff` value gets it from its own module's route, which reads it on the server |
| Content page | `:setting{name="lost-property.items.keep-for"}` | Only `quotable` settings. An unknown or unquotable name fails `bun run check`. The attribute is `name` because Vue reserves `key` |

The rule that a limit is enforced where data is written is met by reading the setting inside the service that writes, never by trusting the form.

## Changing a setting

- One route, `PUT /api/core/settings/<key>`, checks the `change` ability, validates against the entry and the rules, and writes the override, the audit entry and the event `core.setting.changed` in one unit of work.
- Resetting to the default deletes the override.
- The event's payload is the key only, never the value.

## Scope

A setting is site-wide. There is no override for a venue or a production (Matt's answer to question 1): where a value truly varies by record (a ticket price, a hold time for one performance), it is a column on that record whose default comes from a setting.

## What counts as a breaking change

Removing a key, renaming one without `replaces`, changing its kind, or narrowing its limits so a stored value becomes invalid. Each needs a major version and a line in the release notes. Adding a key, widening limits or changing a default does not.

## No operational number is a constant

A lint rule on `layers/*/server/` flags a numeric literal other than 0, 1 or -1 used in a comparison, a date calculation or a limit, unless the line carries a `not-policy:` comment giving the reason (a protocol constant, a page size). The rule cannot prove a number is policy, so it asks the author to say that it is not.

## How to list settings in a specification

Part 6 of each specification uses these columns, one row per setting.

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `lost-property.items.keep-for` | duration | 28d | 1d to 365d | `lost-property.settings.manage`, with confirmation | public | Yes | How long an unclaimed item is kept |
| `lost-property.items.photo-cap` | integer (photos) | 3 | 0 to 10 | `lost-property.settings.manage` | staff | No | Most photographs on one item |

"With confirmation" or "with a reason" in the Changed by column is the field `onChange`. Where a preset should differ from the default, add a note under the table naming the preset and its value.

## What this takes from Proscenium

Proscenium keeps its keys in one file, [`shared/utils/config.ts`](https://github.com/newtheatre/proscenium/blob/main/shared/utils/config.ts), each with a Zod schema, an optional default, a `sensitive` flag and a `synced` flag, and reads overrides once per request in [`server/utils/configuration.ts`](https://github.com/newtheatre/proscenium/blob/main/server/utils/configuration.ts). Its content pages quote keys as `{{HOLD_RELEASE_MINUTES_BEFORE}}`, checked by [`scripts/check-content-tokens.ts`](https://github.com/newtheatre/proscenium/blob/main/scripts/check-content-tokens.ts). This format keeps those four ideas (schema, unset keys, hashed audit, per-request reads) and changes three things: keys belong to modules, the kind drives the screen so no setting needs a hand-built control, and the ability to change a key is declared on the key.

## Where a setting is shown: `scope`

Added 16 November 2026 with Admin (ruling R-33). A setting may declare `scope: 'site'`; the default is `scope: 'module'`. A module-scoped setting appears on its module's generated page at `/console/<module>/settings`. A site-scoped setting is about the installation (email sending, branding, the time zone, updates) and appears in Admin under `/admin/settings`, grouped by module. The scope changes only where the setting is shown: its key, kind, ability, audit and `onChange` behave the same, and the same ability guards it in either place. Every `core.*` setting of foundations is site-scoped.

## Where a setting is shown: groups and pages (replaces `scope`)

Decided by Matt on 16 November 2026 in the settings redesign; the section above is withdrawn and this one prevails. The build brief is in the project files at settings-design/build-brief.md.

**Placement is declared per group, not per setting.** A group is the first segment of a setting's short key (`sign-in`, `brand`, `jobs`). The manifest gains two fields beside `settings`:

```ts
settingGroups: {
  'sign-in':   { place: 'admin', page: 'sign-in' },
  'jobs':      { place: 'admin', advanced: true },
  'brand':     { place: 'admin', screen: '/admin/branding' },
  'programme': { place: 'console', page: 'programme' },
},
settingPages: {
  'sign-in': { place: 'admin', group: 'access', order: 10, icon: '...' },
}
```

| Field | Meaning |
| --- | --- |
| `place` | `'console'` (the default) or `'admin'` |
| `page` | The generated page the group is drawn on. A module other than core defaults to its own page, `/console/<module>/settings`, or its entry under Modules in Admin when the place is admin. Core names a page for every group, because it has none of its own |
| `advanced: true` | The group is drawn on `/admin/advanced`, whichever module declares it, under the module's name. Engineering limits go here |
| `screen` | The address of a bespoke screen that manages the group. The group is then left off every generated page. One setting may carry `screen` where only part of a group is bespoke |
| `change` | The ability for the whole group. A setting may still name its own |

A page is declared once in `settingPages`, which also makes its navigation entry (in place of the generated `core.site-settings` and `<module>.settings` entries); its `group` is one of the navigation groups of its place.

Rules, each held by a check at declaration and in the conformance run:

- **Every setting has exactly one home:** one generated page or one bespoke screen, never both, never two, never none. A setting managed on a bespoke screen (the verified sending domain, the brand colours) is not drawn anywhere else; search still finds it and opens that screen.
- Every setting's group is declared, or defaults to its module's page. No group is on two pages. A `screen` address exists as a page. A module other than core may not name another module's page.
- `scope` is refused, with a message naming `settingGroups`.
- **There is no core settings page** and no catch-all `/admin/settings`; that address and `/console/system/settings` redirect.
- Where a group goes: set once for the installation, or bearing on security or the whole site, Admin; changed in a normal season by the people running the theatre, the console, beside the work it governs.

**Durations.** A `duration` setting, and the period of a `rate` setting, is still stored as whole seconds and still written in a manifest as before (`'30m'`, `'14d'`). For display and entry a month is 30 days and a year is 365 days, and the help line says so. One kit component, `DurationInput`, draws every duration: a number and a unit, offering only the units that can hold a value within the setting's limits, and showing a stored value in the largest unit that divides it exactly: 2,592,000 seconds reads "1 month" and 31,536,000 reads "1 year", whatever the setting was first written in. A setting's label and help therefore never name a unit ("how long a held seat is kept", not "days a held seat is kept"); the conformance run flags a duration setting whose help names one.

**Confirmation.** Only a setting declared `onChange: 'confirm'` or `'reason'` asks for anything more on saving: it shows what will change, asks again, and asks for re-authentication when the session is not fresh (`core.access.fresh-within`). Every other setting saves with no prompt, in Admin as in the console.

**Defaults, history and revert.** Only overrides are stored. A page can show only the settings that differ from their default; reset works per setting and per section, through the ordinary save. `core_setting_changes` gains a screen, `/admin/settings-history` under Upkeep, guarded by `core.audit.view`; each row has Revert, which sets the old value back through the ordinary save, under the same ability, rules and confirmation, as a new row with the reason "Reverted". A sensitive setting's values are never shown and it has no Revert. Release notes list every default a release changed, generated from the manifests.

**Core's notification settings are split (ruled by foundations with this change).** `core.notifications.*` keeps the six settings managed on the bespoke Email screen: sending-domain, verified-domain, sending-label, email-footer, digest-time and digest-day (the last two by integration's ruling in R-37). The engineering half (attempts, retries, the stuck threshold, log retention and inbox retention) moves to a new group, `core.delivery.*`, each key declared with `replaces` naming its old key so a stored override carries across, and the group is `advanced`.

**Where core's groups go (integration ruling R-37, 16 November 2026).** Core is declared by three specifications, and each places its own groups; no group is placed twice.

| Page or screen | Groups | Declared by |
| --- | --- | --- |
| Theatre, `/admin/theatre` | `site` (with `core.site.origin`), `locale` | foundations |
| Theatre, `/admin/theatre` | `organisation` | core domain |
| Branding, bespoke | `brand`, `appearance` | core domain |
| Sign-in, `/admin/sign-in` | `sign-in`, `sessions`, `recovery` | identity |
| Sign-in, `/admin/sign-in` | `access` (`core.access.fresh-within`) | foundations |
| Privacy, `/admin/privacy` | `privacy` | identity |
| Email, bespoke | `notifications` (the six sending and digest settings) | core domain |
| Advanced, `/admin/advanced` | `units`, `jobs`, `external`, `idempotency`, `rate-limits`, `files` | foundations |
| Advanced, `/admin/advanced` | `delivery` | core domain |
| Advanced, `/admin/advanced` | `retention` (unclaimed-after, dormant-after, run-cap) | identity |
| Programme settings, console | `programme` | core domain |
| People settings, console | `grants`, `members-area`, `access-scheme`, `emergency-contacts`, `merge` | identity |

One setting carries a screen of its own: `core.retention.armed`, on identity's Retention screen at `/admin/retention`, declared `onChange: 'reason'`. That screen is a later release, and the setting is declared only in the release that ships it; until then it does not exist and the retention sweeps only report. Identity's settings declared `onChange: 'confirm'`: `core.sign-in.email-link`, `.google`, `.google-domains`, `.managed-domains`, `.provider-is-strong`, and `core.grants.allow-no-expiry`. Core domain's \`webhooks\` group (max-attempts, pause-after, log-retention, timeout) is also on Advanced, and core no longer draws \`/admin/organisation\`, which the Theatre page replaces. Across modules the pattern is: a module's retention periods stay on its own page as a policy choice, unless the module marks them advanced, and its engineering limits go in a group of their own marked advanced (\`forms.limits\`, \`communications.engine\`). Foundations' one confirm setting: `core.site.origin`.

**The interface's groups, and the addresses (settled with Interface, 16 November 2026).** The interface declares `shells`, `language` and `help` on the Theatre page, `appearance` on the bespoke Branding screen (so the table's Branding row reads: `brand` from core domain, `appearance` from the interface), and `lists` and `live` on Advanced. `core.lists.page-size` is a choice of 25, 50 or 100, default 25, the sizes `readList` accepts. A module's admin-placed page is at `/admin/modules/<module>`, under the Modules group, beside the module's entry on the Modules screen. The Admin groups are, in fixed order, Theatre, Modules, Access, Email, Connections, Upkeep, with Overview above them in no group; Upkeep holds Updates, Jobs, Health, Audit log, Settings history and Advanced. The Settings entry under Modules is gone.

**As built, part 1 (kit pull request 115, 17 November 2026); this prevails where it differs from the format above.**

- **No group-level `change`.** The field is withdrawn from the format. Every setting names its ability, as before, and a page shows one line for a section whose settings share one.
- **Page ids** are `<module>.<page>`. Three names are reserved: `core.advanced`, `<module>.settings` (the module's own console page) and `<module>.admin` (its page under Modules).
- **`replaces` is implemented:** the stored value is carried, the old key still answers, and its row goes at the next change. The `core.delivery.*` renames use it.
- **A `screen` names only what the screen draws.** A setting may carry `screen`, or sit in a group that does, only once that bespoke screen shows and saves it. Until then it stays on a generated page, so that no setting is ever reachable only through the API. Two cases today: Branding is a generated page at `/admin/branding` until a bespoke screen exists, and any `core.notifications` setting the Email screen does not yet draw (the email footer and the sending label at the time of writing) is drawn on the Theatre page until it does. Each moves by changing its declaration in the pull request that adds it to the screen.
- **The Email screen is core domain's:** the settings, the sending-domain story and the screen are its own, built with the interface's components. Adding the missing settings to it is core domain's work.
- The older route form (`?module`, `?scope`) answers for one release, so the present page keeps working, and is then removed.

**As built, part 2 (kit pull request 117, 17 November 2026).** History and revert, `core.audit.view`, durations in months and years with `DurationInput`, `core.lists.page-size`, and the check that a duration setting's help names no unit. Three rulings go with it.

- **Freshness on a settings save follows the setting, not the ability.** By Matt's decision only a setting declared `onChange` asks for a fresh sign-in. So when the ability that guards a setting is privileged, its own `fresh: true` is not applied to the save: a fresh sign-in is required when the setting declares `onChange`, and waived otherwise. The ability's `assurance` is not waived; a privileged ability still needs a strong session. The kit does this with a `fresh` override on its ability check that only the kit's own settings saves may pass; a module never passes it, and the conformance check refuses it outside the kit. A specification that wants a fresh sign-in for a setting declares `onChange: 'confirm'` on it.
- **One setting's history is open to whoever may change that setting,** without `core.audit.view` and without an audit entry, so the page can show who last changed it. The whole history needs `core.audit.view`, and each search of it is audited. A sensitive setting's values are shown in neither.
- **A choice's options may be numbers written as text** (`'25'`), as `core.lists.page-size` needs. The reader answers the option as declared, and the caller that wants a number converts it.

**A retention period always confirms (integration's ruling, 17 November 2026).** A setting that a table's `retention` names is a retention period: shortening it lets the next sweep delete or anonymise rows that cannot be brought back. Every such setting is `onChange: 'confirm'`, in core and in every module. The kit infers it: the registry reads the data-class declarations, and a setting named by any table's `retention` is treated as `onChange: 'confirm'` without the manifest saying so. A manifest may still say `'reason'`, which is stronger, and the registry refuses one that says anything weaker. The confirmation for a retention period says how many rows the shorter period would reach at the next sweep, where the kit can count them.
