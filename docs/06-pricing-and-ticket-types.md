# Pricing and ticket types

## The idea

There is a global price list, and two layers of override on top of it. A ticket type such as
"Concession" has a base price; a show can override it; a single performance can override it again.

```
  ticket_types.price                     "Concession is £6"
        ▲
  show_ticket_type_overrides.price       "…but £5 for Macbeth"
        ▲
  performance_ticket_type_overrides.price  "…and £3 for the Wednesday matinee"
```

Same chain for `active` — whether the type is offered at all:

```
  ticket_types.activeByDefault
        ▲  show_ticket_type_overrides.active
        ▲  performance_ticket_type_overrides.active
```

**`NULL` at any layer means "inherit", not "unset".** This is the single most misread thing in the
schema. A show override row with `price = NULL, active = false` means "this type is not offered for
this show, at whatever price it would otherwise have been".

## The rule, in code

`server/utils/tickets.ts` is the canonical implementation:

```ts
export function resolveEffectivePrice(ticketTypeId: string, ctx: TicketPriceContext): number {
  const perfOverride = ctx.perfOverrides.find(o => o.ticketTypeId === ticketTypeId)
  if (perfOverride?.price != null) return perfOverride.price

  const showOverride = ctx.showOverrides.find(o => o.ticketTypeId === ticketTypeId)
  if (showOverride?.price != null) return showOverride.price

  const base = ctx.baseTypes.find(t => t.id === ticketTypeId)
  if (!base) throw createError({ statusCode: 400, statusMessage: `Ticket type ${ticketTypeId} not found` })
  return base.price
}
```

with `loadTicketPriceContext(ticketTypeIds, showId, performanceId)` doing three parallel selects and
`validateTicketTypesExist()` rejecting unknown ids.

**It only handles price.** Every `active` resolution is hand-rolled at the call site, as:

```ts
const active = perfOverride?.active ?? showOverride?.active ?? type.activeByDefault
```

## Five copies

The rule is reimplemented inline in five places:

| File | Resolves |
|---|---|
| `server/utils/tickets.ts` | price only — the canonical one |
| `server/api/whats-on/[slug].get.ts` | price + active |
| `server/api/bookings/available-ticket-types.get.ts` | price + active |
| `server/api/reservations/[id]/available-ticket-types.get.ts` | price + active |
| `server/api/shows/[id]/performances/[performanceId]/ticket-types/index.get.ts` | price + active |

They agree today. Nothing keeps them agreeing, and one of them already carries a comment describing
a *different* rule from the one it implements — "false wins if any level sets it false", where the
code is last-wins.

**The obvious refactor**, and the natural seam for the passes work:

```ts
resolveEffectiveTicketType(ticketTypeId, ctx): { effectivePrice: number, active: boolean }
```

Do this before adding a sixth caller.

## Money

`ticket_types.price`, the override prices and `tickets.pricePaid` are all **integer pence**. There
are no floats or decimals anywhere in this codebase and there must not be. Formatting is the
frontend's job.

This is a deliberate reaction to the legacy system, which used `DecimalField` and stored only a
per-transaction total — making historic unit prices unrecoverable for 5% of sales and requiring
inference for the rest.

## What `pricePaid` means, and where the promise leaks

`tickets.pricePaid` is a **snapshot taken when the ticket row is inserted**. Changing a price later
does not rewrite history. That is the intent, and it is what makes the treasurer's export
trustworthy.

Two places where it leaks:

**1. Adding tickets at collection re-prices at current rates.** `PUT /api/reservations/:id/tickets`
resolves prices afresh for newly-inserted rows, so one reservation can legitimately contain two
tickets of the same type at different prices. Usually correct — if the price changed, the new ticket
costs the new price — but it surprises people.

**2. The collection modal displays current prices, not paid prices.** `CollectModal.vue` builds its
totals from the currently-effective price rather than the `pricePaid` on the existing tickets. So if
a price changed between booking and collection, **the customer is charged the new price at the
door**, and the confirmation email they are holding says something different. This is the one to fix
first.

## Ticket types today

`ticket_types.name` is **UNIQUE and global** — there is no per-show namespace. So types are
theatre-wide concepts ("Adult", "Student", "Member", "Fellow") and per-show variation is expressed
through overrides, not through new types. Resist creating "Macbeth Concession"; that is what the
override chain is for.

Deleting a type that has ever been sold fails — `tickets.ticketTypeId` is `restrict` — and the
handler turns that into a 409. Correct behaviour: retire a type by setting `activeByDefault = false`
rather than deleting it.

## Additions from the legacy migration and passes

Two columns are being added to `ticket_types` (migration `0009`, the legacy import):

- **`kind`** — `SINGLE` | `PASS_SALE` | `PASS_ADMISSION`. Without this split, importing the legacy
  pass counters either double-counts revenue or loses the fact a pass existed. It is also what the
  passes feature uses for the zero-priced admission type.
- **`archived`** — legacy-only types (Fringe, StuFF, the historic pass products) stay valid for
  historic tickets but are hidden from box-office pickers.

And one on `tickets`:

- **`priceConfidence`** — `EXACT` | `DERIVED` | `UNKNOWN`. Records whether an imported price was
  observed or inferred. 94.6% of legacy sales had a single ticket category and so give an exact unit
  price; the rest are apportioned. New tickets are always `EXACT`.

See [ADR-0003](./decisions/0003-legacy-ticketing-import.md) and
[10-passes-design](./10-passes-design.md).

## A note on how the old system did this

Worth one paragraph, because it explains several decisions here.

The legacy Django app resolved prices in **five copy-pasted places**, dispatching on three different
keys — `category.slug` in the till and booking pages, `category.id` in the reports, and
`category.name` in the templates. Prices lived in singleton tables holding only *current* values, so
there was no history. The result: reconciling historic sales against the pricing tables matches
1,232 of 16,255 sales. The override chain and the `pricePaid` snapshot exist specifically so that
never happens again — which is precisely why the five copies of the resolution rule in *this*
codebase are worth consolidating before they drift.
