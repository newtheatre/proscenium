import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { createError } from 'h3'
import { resolvePrice } from '#shared/utils/ticket-types'
import type { PriceSource } from '#shared/utils/ticket-types'
import type { SQL } from 'drizzle-orm'

// Reading the price chain for its administration (D-120). Resolution itself is `resolvePrice()` in
// `shared/utils/ticket-types.ts`; nothing here holds a second answer to what a ticket costs.

// One ticket type against one show or performance: every level of the chain, and what it resolves
// to, so an operator can see why a price is what it is (D-120 criterion 2).
export interface PricedTicketType {
  ticketTypeId: string
  name: string
  description: string | null
  kind: string
  accessKind: string | null
  archived: boolean
  basePrice: number
  activeByDefault: boolean
  showPrice: number | null
  showActive: boolean | null
  performancePrice: number | null
  performanceActive: boolean | null
  price: number
  source: PriceSource
  active: boolean
}

interface PriceRow {
  ticketTypeId: string
  name: string
  description: string | null
  kind: string
  accessKind: string | null
  archived: number
  basePrice: number
  activeByDefault: number
  showPrice: number | null
  showActive: number | null
  performancePrice: number | null
  performanceActive: number | null
}

// SQLite answers a nullable boolean as 0, 1 or null, and null means inherit here rather than off.
const flag = (value: number | null): boolean | null => (value === null ? null : value === 1)

const override = (price: number | null, active: number | null) =>
  (price === null && active === null ? null : { price, active: flag(active) })

function read(row: PriceRow): PricedTicketType {
  const resolved = resolvePrice(
    { price: row.basePrice, activeByDefault: row.activeByDefault === 1 },
    override(row.showPrice, row.showActive),
    override(row.performancePrice, row.performanceActive),
  )
  return {
    ...row,
    archived: row.archived === 1,
    activeByDefault: row.activeByDefault === 1,
    showActive: flag(row.showActive),
    performanceActive: flag(row.performanceActive),
    ...resolved,
  }
}

// The type's own columns, which both screens read the same way.
const TYPE_COLUMNS = sql`
  t.id AS ticketTypeId,
  t.name AS name,
  t.description AS description,
  t.kind AS kind,
  t.access_kind AS accessKind,
  t.archived AS archived,
  t.price AS basePrice,
  t.active_by_default AS activeByDefault,
  so.price AS showPrice,
  so.active AS showActive
`

const ORDER = sql` ORDER BY t.archived, t.price, t.name COLLATE NOCASE`

// A show screen has no performance level, so that half of the chain reads null throughout and the
// resolution rule is still asked exactly once (D-120 criterion 1).
export function showPricesQuery(showId: string): SQL {
  return sql`
    SELECT ${TYPE_COLUMNS}, NULL AS performancePrice, NULL AS performanceActive
    FROM ticket_types t
    LEFT JOIN show_ticket_overrides so ON so.show_id = ${showId} AND so.ticket_type_id = t.id
    WHERE t.archived = 0 OR so.id IS NOT NULL${ORDER}
  `
}

// An archived type stays visible where this level already prices it: retiring a type must not
// silently drop a price somebody set (D-119).
export function performancePricesQuery(performanceId: string): SQL {
  return sql`
    SELECT ${TYPE_COLUMNS}, po.price AS performancePrice, po.active AS performanceActive
    FROM ticket_types t
    JOIN performances p ON p.id = ${performanceId}
    LEFT JOIN show_ticket_overrides so ON so.show_id = p.show_id AND so.ticket_type_id = t.id
    LEFT JOIN performance_ticket_overrides po ON po.performance_id = p.id AND po.ticket_type_id = t.id
    WHERE t.archived = 0 OR so.id IS NOT NULL OR po.id IS NOT NULL${ORDER}
  `
}

export async function showPrices(showId: string): Promise<PricedTicketType[]> {
  return (await db.all<PriceRow>(showPricesQuery(showId))).map(read)
}

export async function performancePrices(performanceId: string): Promise<PricedTicketType[]> {
  return (await db.all<PriceRow>(performancePricesQuery(performanceId))).map(read)
}

export interface PriceOverrideInput {
  ticketTypeId: string
  price: number | null
  active: boolean | null
}

// What moved at this level, in pence and by ticket type. Prices are not personal data, so the
// trail carries both figures rather than only that something changed (0011, D-120 criterion 5).
export function pricingDetail(
  held: PricedTicketType[],
  wanted: PriceOverrideInput[],
  priceField: 'showPrice' | 'performancePrice',
  activeField: 'showActive' | 'performanceActive',
): Record<string, unknown> {
  const asked = new Map(wanted.map(override => [override.ticketTypeId, override]))
  const moved = held.flatMap((price) => {
    const next = asked.get(price.ticketTypeId) ?? { price: null, active: null }
    if (next.price === price[priceField] && next.active === price[activeField]) return []
    return [{
      ticketType: price.name,
      price: [price[priceField], next.price],
      active: [price[activeField], next.active],
    }]
  })
  return { changed: moved }
}

export interface OverridesToWrite {
  // Both fields null is no override at all, so the row is dropped rather than left saying
  // nothing: null means inherit and an absent row means the same thing (D-120 criterion 1).
  setting: PriceOverrideInput[]
  detail: Record<string, unknown>
}

// The two routes share this shape exactly: refuse an unknown type, drop a cleared override
// rather than store it, and record what moved (D-120 criteria 1 and 5).
export function overridesToWrite(
  held: PricedTicketType[],
  input: PriceOverrideInput[],
  priceField: 'showPrice' | 'performancePrice',
  activeField: 'showActive' | 'performanceActive',
): OverridesToWrite {
  const known = new Set(held.map(price => price.ticketTypeId))
  for (const override of input) {
    if (!known.has(override.ticketTypeId)) {
      throw createError({ statusCode: 400, statusMessage: 'No such ticket type' })
    }
  }
  return {
    setting: input.filter(override => override.price !== null || override.active !== null),
    detail: pricingDetail(held, input, priceField, activeField),
  }
}
