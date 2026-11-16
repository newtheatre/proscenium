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

Added 16 November 2026 with Site administration (ruling R-33). A setting may declare `scope: 'site'`; the default is `scope: 'module'`. A module-scoped setting appears on its module's generated page at `/console/<module>/settings`. A site-scoped setting is about the installation (email sending, branding, the time zone, updates) and appears in Site administration under `/admin/settings`, grouped by module. The scope changes only where the setting is shown: its key, kind, ability, audit and `onChange` behave the same, and the same ability guards it in either place. Every `core.*` setting of foundations is site-scoped.