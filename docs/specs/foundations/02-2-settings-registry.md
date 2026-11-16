# Settings registry

A setting is declared once, in its module's manifest, with a kind, a default and the ability needed to change it. The settings screen, the validation, the audit entry and the token a public page quotes are all generated from that one entry.

## An entry

```ts
// layers/box-office/module/settings.ts
import { defineSettings, setting } from '#kit'

export const settings = defineSettings('box-office', {
  'holds.release-before': setting.duration({
    default: '30m',
    min: '0m',
    max: '24h',
    change: 'box-office.settings.manage',
    audience: 'public',
    quotable: true,
  }),
  'orders.seat-cap': setting.integer({
    default: 8,
    min: 1,
    max: 50,
    unit: 'seats',
    change: 'box-office.settings.manage',
    audience: 'public',
    quotable: true,
  }),
})
```

The full key is the module id plus the short key: `box-office.holds.release-before`. `defineSettings` adds the prefix, so a module cannot declare a key outside its own name.

## Kinds

The kind decides the control on the settings screen, the stored form and how a token is written out.

| Kind | Written in the manifest as | Stored and read as | A token shows |
| --- | --- | --- | --- |
| `boolean` | `true` | boolean | "yes" or "no" |
| `integer` | `8`, with optional `unit` | integer | "8 seats" |
| `money` | `1250` | integer minor units, in the theatre's currency | "£12.50" |
| `duration` | `'30m'`, `'2h'`, `'14d'` | integer seconds | "30 minutes" |
| `time` | `'04:00'` | `HH:MM` in the theatre's time zone | "4:00 am" |
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
| `audience` | No, default `staff` | Who may read it: `public`, `signed-in` or `staff`. Decides whether the browser may ever receive the value |
| `quotable` | No, default `false` | A content page may quote it by token. Requires `audience: 'public'` |
| `sensitive` | No | The value could identify a person. The audit entry records a hash, not the value, and the setting cannot be public |
| `managed` | No | Written only by a sync or a setup step, not by the settings screen |
| `replaces` | No | The key this one was renamed from. The old value is carried over and the old key answers for one major version |
| `since` | No | The release it first appeared in |

Labels, help text and option labels are translation keys derived from the key: `box-office.settings.holds.release-before.label` and `.help`.

## Rules across settings

A rule that involves two settings is declared beside them and checked on every save.

```ts
export const settingRules = defineSettingRules('box-office', [
  {
    id: 'reminder-before-release',
    check: s => s['holds.reminder-before'] > s['holds.release-before'],
  },
])
```

A failed rule refuses the save and shows the message at `box-office.settings.rules.reminder-before-release`.

## Reading a setting

| Where | How | Notes |
| --- | --- | --- |
| Server | `await useSetting('box-office.orders.seat-cap')` | Typed from the key. Read once per request, so a change takes effect on the next request and never mid-request |
| Browser | `useSetting('box-office.orders.seat-cap')` | Only `public` and `signed-in` settings exist in the browser; a `staff` one is a type error |
| Content page | `:setting{key="box-office.orders.seat-cap"}` | Only `quotable` settings. An unknown or unquotable key fails `bun run check` |

The rule that a limit is enforced where data is written is met by reading the setting inside the service that writes, never by trusting the form.

## Changing a setting

- One route, `PUT /api/core/settings/<key>`, checks the `change` ability, validates against the entry and the rules, and writes the override, the audit entry and the event `core.setting.changed` in one unit of work.
- Resetting to the default deletes the override.
- The event's payload is the key only, never the value.

## Scope

A setting is site-wide. Draft 1 has no per-venue or per-production override: where a value truly varies by record (a ticket price, a hold time for one performance), it is a column on that record whose default comes from a setting. Questions for Matt asks whether that is enough.

## What counts as a breaking change

Removing a key, renaming one without `replaces`, changing its kind, or narrowing its limits so a stored value becomes invalid. Each needs a major version and a line in the release notes. Adding a key, widening limits or changing a default does not.

## No operational number is a constant

A lint rule on `layers/*/server/` flags a numeric literal other than 0, 1 or -1 used in a comparison, a date calculation or a limit, unless the line carries a `not-policy:` comment giving the reason (a protocol constant, a page size). The rule cannot prove a number is policy, so it asks the author to say that it is not.

## How to list settings in a specification

Part 6 of each specification uses these columns, one row per setting.

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `box-office.holds.release-before` | duration | 30m | 0m to 24h | `box-office.settings.manage` | public | Yes | How long before curtain an unpaid booking is released |
| `box-office.orders.seat-cap` | integer (seats) | 8 | 1 to 50 | `box-office.settings.manage` | public | Yes | Most seats in one online order |

The two rows are examples of the format, not decisions about the box office; workstream 4 owns the real ones. Where a preset should differ from the default, add a note under the table naming the preset and its value.

## What this takes from Proscenium

Proscenium keeps its keys in one file, [`shared/utils/config.ts`](https://github.com/newtheatre/proscenium/blob/main/shared/utils/config.ts), each with a Zod schema, an optional default, a `sensitive` flag and a `synced` flag, and reads overrides once per request in [`server/utils/configuration.ts`](https://github.com/newtheatre/proscenium/blob/main/server/utils/configuration.ts). Its content pages quote keys as `{{HOLD_RELEASE_MINUTES_BEFORE}}`, checked by [`scripts/check-content-tokens.ts`](https://github.com/newtheatre/proscenium/blob/main/scripts/check-content-tokens.ts). This format keeps those four ideas (schema, unset keys, hashed audit, per-request reads) and changes three things: keys belong to modules, the kind drives the screen so no setting needs a hand-built control, and the ability to change a key is declared on the key.

## Later rulings that apply to this tab

Added after this tab was written; the full list is at the end of the Formats tab. For settings: there is a kind `colour`; and settings are site-wide only, pending Matt's answer to question 1 (anything that varies by venue, production or performance is a field on that record whose default comes from the setting).
