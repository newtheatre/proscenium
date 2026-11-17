// Sales reports (Box office specification, part 5, salesSummary, and part 6, "Sales report"): counts
// and face value for one production, by performance, ticket type and channel. Sold means a live
// ticket line on a confirmed order; reserved lines are counted beside it, not in it. Complimentary
// tickets are shown apart, as the specification asks, and add nothing to face value.
import { all, nowMs } from '#kit'
import { getProduction, listPerformances } from '#modules/core'

export interface SalesLine { performanceId: string, ticketTypeId: string, ticketType: string, kind: string, channel: string, state: 'confirmed' | 'reserved', tickets: number, valueMinor: number, currency: string }

export interface PerformanceSales {
  id: string
  label: string | null
  startsAt: number
  state: string
  capacity: number
  sold: number
  reserved: number
  complimentary: number
  admitted: number
  valueMinor: number
}

export interface SalesSummary {
  production: { id: string, title: string }
  currency: string
  performances: PerformanceSales[]
  byType: { ticketTypeId: string, name: string, kind: string, tickets: number, valueMinor: number }[]
  byChannel: { channel: string, tickets: number, valueMinor: number }[]
  totals: { sold: number, reserved: number, complimentary: number, admitted: number, valueMinor: number }
}

/** The productions Box office sells or has sold, newest run first. */
export async function soldProductions(): Promise<{ id: string, title: string, startsAt: number }[]> {
  const rows = await all<{ performance_id: string }>('SELECT performance_id FROM box_office_performance_sales')
  const ids = new Set(rows.map(r => r.performance_id))
  const firsts = new Map<string, number>()
  for (const p of await listPerformances({})) {
    if (!ids.has(p.id)) continue
    firsts.set(p.productionId, Math.min(firsts.get(p.productionId) ?? Number.POSITIVE_INFINITY, p.startsAt))
  }
  const out = []
  for (const [id, startsAt] of firsts) out.push({ id, title: (await getProduction(id)).title, startsAt })
  return out.sort((a, b) => b.startsAt - a.startsAt)
}

export async function salesSummary(productionId: string): Promise<SalesSummary> {
  const production = await getProduction(productionId)
  const performances = await listPerformances({ productionId })
  const ids = performances.map(p => p.id)
  const marks = ids.map(() => '?').join(', ') || 'NULL'
  const lines = (await all<{ performance_id: string, ticket_type_id: string, name: string, kind: string, channel: string, state: 'confirmed' | 'reserved', tickets: number, value: number, currency: string }>(
    `SELECT l.performance_id, l.ticket_type_id, t.name, t.kind, o.channel, o.state, count(*) AS tickets, sum(l.amount_minor) AS value, o.currency
      FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id JOIN box_office_ticket_types t ON t.id = l.ticket_type_id
      WHERE l.kind = 'ticket' AND l.state = 'live' AND o.state IN ('confirmed', 'reserved') AND l.performance_id IN (${marks})
      GROUP BY l.performance_id, l.ticket_type_id, o.channel, o.state, o.currency`, ...ids))
    .map((r): SalesLine => ({ performanceId: r.performance_id, ticketTypeId: r.ticket_type_id, ticketType: r.name, kind: r.kind, channel: r.channel, state: r.state, tickets: r.tickets, valueMinor: r.value, currency: r.currency }))
  const capacity = new Map((await all<{ performance_id: string, capacity: number }>(`SELECT performance_id, sum(capacity) AS capacity FROM box_office_pools WHERE performance_id IN (${marks}) GROUP BY performance_id`, ...ids)).map(r => [r.performance_id, r.capacity]))
  const admitted = new Map((await all<{ performance_id: string, n: number }>(`SELECT performance_id, count(*) AS n FROM box_office_tickets WHERE state = 'valid' AND admitted_at IS NOT NULL AND performance_id IN (${marks}) GROUP BY performance_id`, ...ids)).map(r => [r.performance_id, r.n]))

  const sold = lines.filter(l => l.state === 'confirmed')
  const isComp = (l: SalesLine) => l.kind === 'complimentary'
  const sum = (rows: SalesLine[], pick: (l: SalesLine) => number) => rows.reduce((total, l) => total + pick(l), 0)
  const rows = performances.map((p): PerformanceSales => {
    const own = lines.filter(l => l.performanceId === p.id)
    const paid = own.filter(l => l.state === 'confirmed' && !isComp(l))
    return {
      id: p.id, label: p.label, startsAt: p.startsAt, state: p.state, capacity: capacity.get(p.id) ?? 0,
      sold: sum(paid, l => l.tickets),
      reserved: sum(own.filter(l => l.state === 'reserved'), l => l.tickets),
      complimentary: sum(own.filter(l => l.state === 'confirmed' && isComp(l)), l => l.tickets),
      admitted: admitted.get(p.id) ?? 0,
      valueMinor: sum(paid, l => l.valueMinor),
    }
  })

  const byType = new Map<string, SalesSummary['byType'][number]>()
  const byChannel = new Map<string, SalesSummary['byChannel'][number]>()
  for (const l of sold) {
    const type = byType.get(l.ticketTypeId) ?? { ticketTypeId: l.ticketTypeId, name: l.ticketType, kind: l.kind, tickets: 0, valueMinor: 0 }
    type.tickets += l.tickets
    type.valueMinor += l.valueMinor
    byType.set(l.ticketTypeId, type)
    const channel = byChannel.get(l.channel) ?? { channel: l.channel, tickets: 0, valueMinor: 0 }
    channel.tickets += l.tickets
    channel.valueMinor += l.valueMinor
    byChannel.set(l.channel, channel)
  }
  const add = (key: 'sold' | 'reserved' | 'complimentary' | 'admitted' | 'valueMinor') => rows.reduce((total, r) => total + r[key], 0)
  return {
    production: { id: production.id, title: production.title },
    currency: lines[0]?.currency ?? 'GBP',
    performances: rows,
    byType: [...byType.values()].sort((a, b) => b.tickets - a.tickets),
    byChannel: [...byChannel.values()].sort((a, b) => b.tickets - a.tickets),
    totals: { sold: add('sold'), reserved: add('reserved'), complimentary: add('complimentary'), admitted: add('admitted'), valueMinor: add('valueMinor') },
  }
}

export const SALES_COLUMNS = [
  { key: 'performance', label: 'Performance' },
  { key: 'startsAt', label: 'Starts' },
  { key: 'ticketType', label: 'Ticket type' },
  { key: 'channel', label: 'Channel' },
  { key: 'state', label: 'State' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'value', label: 'Face value' },
  { key: 'currency', label: 'Currency' },
] as const

/** One row per performance, ticket type, channel and state, for a spreadsheet. */
export async function salesRows(productionId: string): Promise<Record<string, unknown>[]> {
  const summary = await salesSummary(productionId)
  const ids = summary.performances.map(p => p.id)
  const marks = ids.map(() => '?').join(', ') || 'NULL'
  const lines = await all<{ performance_id: string, name: string, channel: string, state: string, tickets: number, value: number, currency: string }>(
    `SELECT l.performance_id, t.name, o.channel, o.state, count(*) AS tickets, sum(l.amount_minor) AS value, o.currency
      FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id JOIN box_office_ticket_types t ON t.id = l.ticket_type_id
      WHERE l.kind = 'ticket' AND l.state = 'live' AND o.state IN ('confirmed', 'reserved') AND l.performance_id IN (${marks})
      GROUP BY l.performance_id, t.name, o.channel, o.state, o.currency ORDER BY l.performance_id, t.name`, ...ids)
  const performance = new Map(summary.performances.map(p => [p.id, p]))
  return lines.map(l => ({
    performance: [summary.production.title, performance.get(l.performance_id)?.label].filter(Boolean).join(', '),
    startsAt: new Date(performance.get(l.performance_id)?.startsAt ?? nowMs()).toISOString(),
    ticketType: l.name,
    channel: l.channel,
    state: l.state === 'confirmed' ? 'sold' : 'reserved',
    tickets: l.tickets,
    value: (l.value / 100).toFixed(2), // not-policy: minor units to units; every currency sold here has two decimals
    currency: l.currency,
  }))
}

export function toCsv(rows: readonly Record<string, unknown>[], columns: readonly { key: string, label: string }[]): string {
  const cell = (value: unknown): string => {
    let text = value === null || value === undefined ? '' : String(value)
    // A cell a spreadsheet would run as a formula is written as text.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.map(c => cell(c.label)).join(',')]
  for (const row of rows) lines.push(columns.map(c => cell(row[c.key])).join(','))
  return `${lines.join('\r\n')}\r\n`
}
