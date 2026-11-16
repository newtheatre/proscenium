# Abilities registry

A module declares three things about permission: the abilities that can be granted, the record types a grant can be narrowed to, and the facts that confer authority without a grant. Roles, grants, expiry and the permission screens belong to workstream 2; this format is what they read.

## Who owns what

| Foundations (this format) | Workstream 2 (identity and accounts) |
| --- | --- |
| How an ability, a record type and a fact are declared | Roles a theatre defines, and the preset role names |
| The call a route makes to check an ability | How a check is resolved: role grants, facts, ownership, expiry |
| The build checks on the registry | Nobody grants themselves a role; second-factor re-assertion |
| The generated access matrix | The permission screens |

## Record types

A record type names a kind of record that permissions, audit entries, files and custom fields can point at.

```ts
// layers/box-office/module/abilities.ts
import { defineRecords, defineAbilities, record, ability } from '#kit'

export const records = defineRecords('box-office', {
  order: record({ table: 'box_office_orders', parent: 'core.performance', owner: 'account_id' }),
})
```

| Field | Meaning |
| --- | --- |
| `table` | The table whose rows are records of this type. A record type may have no table and a fixed set of ids, for example `core.branding` with the one id `site`; its resolver then gives the label, the address and the parent |
| `parent` | The record type it sits under, at most one. A grant on a production covers that production's performances and their orders. `parent: { type, optional: true }` allows a row with no parent, which inherits nothing |
| `owner` | The column holding the account that owns the record, if it has one |

The module also contributes a resolver to the point `core.record-resolver`, which answers a record's parent, title and link. The core declares `core.production`, `core.performance`, `core.venue`, `core.space`, `core.season` and `core.account`, to workstream 3's and workstream 2's definitions.

## Abilities

An ability is one thing a person may be permitted to do. It is named for the record it acts on and the verb.

```ts
export const abilities = defineAbilities('box-office', {
  'order.view':      ability({ on: 'box-office.order', owner: 'grants' }),
  'order.sell':      ability({ on: 'core.performance' }),
  'order.refund':    ability({ on: 'box-office.order', risk: 'privileged', owner: 'refuses', implies: ['order.view'] }),
  'settings.manage': ability({ risk: 'privileged' }),
})
```

| Field | Default | Meaning |
| --- | --- | --- |
| `on` | none | The record type the ability acts on. Without it the ability is site-wide only |
| `risk` | `normal` | `normal` or `privileged`; there is no other value. Privileged abilities touch money, personal data or safety, need a strong session, and are marked on the permission screen |
| `assurance` | `basic`; `strong` when `risk` is `privileged` | The strength of session the ability needs. Identity defines the two levels |
| `fresh` | `false`; `true` when `risk` is `privileged` | The person must have signed in again within `core.access.fresh-within`, the one freshness window. A privileged ability that changes anything is always fresh. One that only reads may say `fresh: false`, and must then say `audit: 'read'` |
| `owner` | `ignored` | `grants`: the record's owner always has the ability. `refuses`: the owner never has it on their own record, whatever their role, which is how approving your own refund is refused. There is no other declarative refusal: roles, facts and ownership only allow, and any other lockout is a guard in the module's own service |
| `implies` | none | Other abilities of the same module that come with this one |
| `audit` | `true` | Using the ability writes an audit entry, which records what allowed the action (`allowed_by`: the grant or the fact). `'read'` also audits reads made under it. `false` only for reads that need no trail |
| `grantAt` | every level that applies | Restricts where a grant may be made: `site`, `module` or `record`. An ability such as erasing an account can be limited to site-wide grants |

### Scope

The paper's three scopes fall out of `on` and `parent`, with nothing more to declare:

| A grant made at | Covers |
| --- | --- |
| The site | The ability everywhere |
| A module | Every ability of that module, everywhere |
| A record | The ability on that record and on every record beneath it |

So a visiting company's manager, granted `box-office.order.refund` on one production, may refund orders for that production's performances and nothing else.

## Facts

A fact is authority that follows from a record instead of a grant: tonight's confirmed shift, a current training record, a place on a production team.

```ts
// layers/front-of-house/module/abilities.ts
export const facts = defineFacts('front-of-house', {
  'on-shift': fact({ on: 'core.performance', standing: true }),
})

// layers/front-of-house/server/facts/on-shift.ts
export default defineFact({
  holds: async (account, record) => { /* yes or no, and until when */ },
  holders: async (record) => { /* the accounts that hold it now */ },
})
```

- The module supplies `server/facts/<name>.ts`, which answers whether an account holds the fact, for which record, and until when.
- A theatre maps abilities to a fact exactly as it maps them to a role, on the same screen. A fact is a role nobody can hand out.
- A fact may be given abilities from any module. A preset may suggest the mapping; a suggestion that names a module which is switched off is ignored.
- A fact of a switched-off module grants nothing.
- A fact never grants a `privileged` ability unless the theatre confirms that mapping explicitly.

Three optional parts of a fact:

- `standing: true` means that holding the fact puts a person on the members' side of their account.
- `pin: true` lets a theatre map the fact to abilities for one named record, for example `training.competent` for one competency. The mapping row holds that record's id, and the fact is judged against it whatever record the ability is used on. A mapping whose pinned record no longer exists grants nothing and the permission screen shows it as broken.
- `holders(record?)` lists the accounts that hold the fact now, for one record or for any. Identity's `holdersOf` uses it to show who an ability reaches. A fact without it cannot be enumerated, and the permission screen says so.

Both functions are asynchronous and read-only. They are safe to await inside a route before the unit of work commits, and are never run from a queue. Identity owns the tables that map abilities to roles and to facts.

## Checking

One call, the same on the server and in the browser, so the interface never shows what the server will refuse.

```ts
// in a route
export default defineRoute({
  ability: 'box-office.order.refund',
  record: event => ['box-office.order', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: refundInput,
}, async (event, { input, actor }) => { /* ... */ })

// in a component
const allowed = can('box-office.order.refund', ['box-office.order', order.id])
```

- `defineRoute` is the only way to write a route. A route names a declared ability, or says `ability: 'signed-in'` for any signed-in person, or says `public: true` for anyone; there is no `ability: 'public'`. A route that says none of these, or has no `rateLimit`, fails the build. The ability is checked before the input is validated, so a refused caller learns nothing of the input's shape.
- A refusal carries a reason and what would allow it ("needs a current till training record"), as translation keys.
- The check runs on every write on the server. The browser's `can` only decides what to show.

## What the build generates and checks

- **An access matrix**: every ability, the routes that require it and the preset roles and facts that hold it, written to the contributor documentation. Proscenium keeps this by hand in [`docs/access-matrix.md`](https://github.com/newtheatre/proscenium/blob/main/docs/access-matrix.md) and tests it against the code.
- A route that names an ability no module declares fails the check.
- An ability no route requires fails the check: it would be a permission that permits nothing.
- An `owner` field on an ability whose record type declares no owner column fails the check.

## How to list abilities in a specification

Part 6 of each specification uses these columns.

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `box-office.order.view` | `box-office.order` | normal | grants |  | See an order and its tickets | Box-office staff; fact `front-of-house.on-shift` |
| `box-office.order.refund` | `box-office.order` | privileged | refuses | `order.view` | Refund an order | Box-office manager |

The rows are examples of the format; workstream 4 owns the real ones. Facts and record types get a short table each: name, record type, and one line on when it holds.

## What this designs out

Proscenium's roles are a fixed list of NNT committee posts in code (`PRIVILEGED_FLOOR` in [`shared/utils/config.ts`](https://github.com/newtheatre/proscenium/blob/main/shared/utils/config.ts) names `PRESIDENT`, `TREASURER`, `FOH_MANAGER` and others), and per-record permission arrived late. Here no role name appears in any module: modules declare abilities, and only a preset mentions a role.
