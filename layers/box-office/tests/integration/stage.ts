// Shared set-up for the box office tests: a scheduled performance in the core, made through the
// core's own routes, and a house set up for sale through Box office's.
import { expect } from 'vitest'
import { changeSetting, createUnit, newId } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import createProduction from '../../../core/server/api/core/productions/index.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedulePerformance from '../../../core/server/api/core/performances/[id]/schedule.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import ticketTypesPost from '../../server/api/box-office/ticket-types/index.post'
import ticketTypesGet from '../../server/api/box-office/ticket-types/index.get'
import bandsPost from '../../server/api/box-office/productions/[id]/bands/index.post'
import bandsGet from '../../server/api/box-office/productions/[id]/bands/index.get'
import pricesPost from '../../server/api/box-office/productions/[id]/prices.post'
import salesPut from '../../server/api/box-office/performances/[id]/sales/index.put'
import salesGet from '../../server/api/box-office/performances/[id]/sales/index.get'
import openPost from '../../server/api/box-office/performances/[id]/sales/open.post'
import pausePost from '../../server/api/box-office/performances/[id]/sales/pause.post'
import scanPost from '../../server/api/box-office/performances/[id]/scan.post'
import availabilityGet from '../../server/api/box-office/availability/[id].get'
import basketsPost from '../../server/api/box-office/baskets/index.post'
import basketGet from '../../server/api/box-office/baskets/[id]/index.get'
import reservePost from '../../server/api/box-office/baskets/[id]/reserve.post'
import checkoutPost from '../../server/api/box-office/baskets/[id]/checkout.post'
import payPost from '../../server/api/box-office/baskets/[id]/pay.post'
import confirmPost from '../../server/api/box-office/reservations/confirm.post'
import releasePost from '../../server/api/box-office/orders/[id]/release.post'
import keepPost from '../../server/api/box-office/orders/[id]/keep.post'
import orderLinkGet from '../../server/api/box-office/orders/link/index.get'
import cancelPost from '../../server/api/box-office/orders/[id]/cancel.post'
import amendPost from '../../server/api/box-office/orders/[id]/amend.post'
import performancesGet from '../../server/api/box-office/performances/index.get'
import doorGet from '../../server/api/box-office/performances/[id]/door.get'
import doorAdmit from '../../server/api/box-office/performances/[id]/door/admit.post'
import ordersGet from '../../server/api/box-office/orders/index.get'
import orderGet from '../../server/api/box-office/orders/[id]/index.get'
import deskOrdersGet from '../../server/api/box-office/desk/orders.get'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import tillSummaryPost from '../../../payments/server/api/payments/till/summary.post'
import orderCancelPost from '../../server/api/box-office/orders/link/cancel.post'
import reportsSalesGet from '../../server/api/box-office/reports/sales.get'
import reportsSalesCsv from '../../server/api/box-office/reports/sales.csv.get'
import compsGet from '../../server/api/box-office/comps/index.get'
import compsPost from '../../server/api/box-office/comps/index.post'
import compApprove from '../../server/api/box-office/comps/[id]/approve.post'
import compDecline from '../../server/api/box-office/comps/[id]/decline.post'
import compWithdraw from '../../server/api/box-office/comps/[id]/withdraw.post'
import { createBasket, type Basket, type BasketLineInput } from '../../server/baskets'
import { call, env, inContext, person, server, setModule } from '../../../../tests/integration/helpers'

export const NOV_16 = Date.UTC(2026, 10, 16, 12)

export const handle = server({
  'POST /api/core/productions': createProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedulePerformance,
  'POST /api/core/venues': createVenue,
  'POST /api/box-office/ticket-types': ticketTypesPost,
  'GET /api/box-office/ticket-types': ticketTypesGet,
  'POST /api/box-office/productions/:id/bands': bandsPost,
  'GET /api/box-office/productions/:id/bands': bandsGet,
  'POST /api/box-office/productions/:id/prices': pricesPost,
  'PUT /api/box-office/performances/:id/sales': salesPut,
  'GET /api/box-office/performances/:id/sales': salesGet,
  'POST /api/box-office/performances/:id/sales/open': openPost,
  'POST /api/box-office/performances/:id/sales/pause': pausePost,
  'POST /api/box-office/performances/:id/scan': scanPost,
  'GET /api/box-office/availability/:id': availabilityGet,
  'POST /api/box-office/baskets': basketsPost,
  'GET /api/box-office/baskets/:id': basketGet,
  'POST /api/box-office/baskets/:id/reserve': reservePost,
  'POST /api/box-office/baskets/:id/checkout': checkoutPost,
  'POST /api/box-office/baskets/:id/pay': payPost,
  'POST /api/box-office/reservations/confirm': confirmPost,
  'GET /api/box-office/orders/link': orderLinkGet,
  'GET /api/box-office/orders': ordersGet,
  'GET /api/box-office/performances': performancesGet,
  'GET /api/box-office/performances/:id/door': doorGet,
  'POST /api/box-office/performances/:id/door/admit': doorAdmit,
  'GET /api/box-office/orders/:id': orderGet,
  'POST /api/box-office/orders/:id/release': releasePost,
  'POST /api/box-office/orders/:id/keep': keepPost,
  'POST /api/box-office/orders/link/cancel': orderCancelPost,
  'POST /api/box-office/orders/:id/cancel': cancelPost,
  'POST /api/box-office/orders/:id/amend': amendPost,
  'GET /api/box-office/desk/orders': deskOrdersGet,
  'GET /api/box-office/reports/sales': reportsSalesGet,
  'GET /api/box-office/reports/sales.csv': reportsSalesCsv,
  'GET /api/box-office/comps': compsGet,
  'POST /api/box-office/comps': compsPost,
  'POST /api/box-office/comps/:id/approve': compApprove,
  'POST /api/box-office/comps/:id/decline': compDecline,
  'POST /api/box-office/comps/:id/withdraw': compWithdraw,
  'POST /api/payments/till/sale': tillSalePost,
  'POST /api/payments/till/summary': tillSummaryPost,
})

export const manager = person(['core.production.create', 'core.production.edit', 'core.performance.schedule', 'core.venue.manage', 'box-office.performance.manage', 'box-office.pricing.manage'])

let keys = 0
export async function req<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | null = manager, headers: Record<string, string> = {}): Promise<{ status: number, body: T }> {
  const idempotency = method === 'POST' ? { 'idempotency-key': `bo${++keys}-${newId('req')}` } : {}
  const response = await call(handle, method, path, { actor: actor ?? undefined, body, headers: { ...idempotency, ...headers } })
  return { status: response.status, body: await response.json() as T }
}

/** Switches the modules on, sets the time zone and adds a cash provider, so a paid price can be sold. */
export async function ready(): Promise<void> {
  // No challenge secret, as at a theatre that has not set one: the challenge is then quietly off.
  ;(env as any).CORE_TURNSTILE_SECRET_KEY = ''
  for (const id of ['finance', 'payments', 'box-office']) await setModule(id, true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(newId('ppa'), NOV_16, NOV_16).run()
}

export interface House { productionId: string, performanceId: string, bandId: string, fullId: string, concessionId: string }

let n = 0
let types: { fullId: string, concessionId: string } | undefined

/** A scheduled performance with one band of `capacity` seats, priced, and (unless told not to) on sale. */
export async function house(capacity: number, options: { open?: boolean, houseCapacity?: number, startsAt?: number } = {}): Promise<House> {
  n++
  resetRateLimits()
  const production = await req('POST', '/api/core/productions', { title: `Box office show ${n}`, kind: 'own' })
  expect(production.status, JSON.stringify(production.body)).toBe(200)
  const venue = await req('POST', '/api/core/venues', { name: `Box office venue ${n}` })
  const performance = await req('POST', `/api/core/productions/${production.body.id}/performances`, {
    venueId: venue.body.venueId, spaceId: venue.body.spaceId, startsAt: options.startsAt ?? Date.UTC(2027, 2, n % 28 + 1, 19, 30), capacity: options.houseCapacity ?? 500,
  })
  expect(performance.status, JSON.stringify(performance.body)).toBe(200)
  expect((await req('POST', `/api/core/performances/${performance.body.id}/schedule`, {})).status).toBe(200)
  if (!types) {
    const full = await req('POST', '/api/box-office/ticket-types', { name: 'Full price' })
    const concession = await req('POST', '/api/box-office/ticket-types', { name: 'Concession', kind: 'concession', proofNote: 'Bring proof' })
    types = { fullId: full.body.ticketTypeId, concessionId: concession.body.ticketTypeId }
  }
  const band = await req('POST', `/api/box-office/productions/${production.body.id}/bands`, { name: 'Stalls' })
  expect(band.status, JSON.stringify(band.body)).toBe(200)
  const made: House = { productionId: production.body.id, performanceId: performance.body.id, bandId: band.body.bandId, ...types }
  const sales = await req('PUT', `/api/box-office/performances/${made.performanceId}/sales`, { pools: [{ bandId: made.bandId, capacity }] })
  expect(sales.status, JSON.stringify(sales.body)).toBe(200)
  if (options.open === false) return made
  const prices = await req('POST', `/api/box-office/productions/${made.productionId}/prices`, { prices: [
    { bandId: made.bandId, ticketTypeId: made.fullId, amountMinor: 1200 },
    { bandId: made.bandId, ticketTypeId: made.concessionId, amountMinor: 800 },
  ] })
  expect(prices.status, JSON.stringify(prices.body)).toBe(200)
  const opened = await req('POST', `/api/box-office/performances/${made.performanceId}/sales/open`, {})
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  return made
}

export type Outcome = { ok: true, basket: Basket } | { ok: false, code: string, reason: string }

/** One buyer's attempt, as a unit of its own, straight through the service: no rate limit in the way. */
export async function buy(h: House, quantity: number, lines?: BasketLineInput[]): Promise<Outcome> {
  try {
    const basket = await inContext(async () => {
      const unit = createUnit()
      const made = await createBasket(unit.view(), { performanceId: h.performanceId, lines: lines ?? [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity }] })
      await unit.commit()
      return made
    })
    return { ok: true, basket }
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false, code: error.code, reason: error.reason }
  }
}
