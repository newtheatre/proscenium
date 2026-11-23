// Finance's reports (Box office specification, part 5): a production's statement (FIN-04), the
// ledger as CSV for a range of days (FIN-05) and clearing accounts against payouts (FIN-06, totals).
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { postEntries } from '../../server/services'
import statementRoute from '../../server/api/finance/productions/[id].get'
import productionsRoute from '../../server/api/finance/productions.get'
import exportRoute from '../../server/api/finance/export.get'
import reconcileRoute from '../../server/api/finance/reconcile.get'
import { call, env, inContext, person, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 12)
const handle = server({
  'GET /api/finance/productions/:id': statementRoute,
  'GET /api/finance/productions': productionsRoute,
  'GET /api/finance/export': exportRoute,
  'GET /api/finance/reconcile': reconcileRoute,
})
let hamlet: string
let other: string

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

const sold = (key: string, production: string, amount: number, kind: 'sale' | 'refund' = 'sale', occurredAt?: number) => commit(unit => postEntries(unit.view(), {
  key,
  source: { module: 'tickets', type: 'tickets.order', id: key },
  kind,
  occurredAt,
  entries: [
    { account: { key: 'tickets.clearing', scope: 'ppa_card' }, amountMinor: amount },
    { account: { key: 'tickets.income' }, amountMinor: -amount, productionId: production, performanceId: `prf_${production}` },
  ],
}))

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'tickets']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  hamlet = 'prd_hamlet'
  other = 'prd_other'
  for (const [id, title] of [[hamlet, 'Hamlet'], [other, 'The Seagull']]) {
    await env.DB.prepare("INSERT INTO core_productions (id, slug, title, kind, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, ?, 'visiting', 'draft', 1, 1, 0, 0, ?)")
      .bind(id, id, title, NOV_16).run()
  }
  await sold('hamlet-1', hamlet, 2000)
  await sold('hamlet-2', hamlet, 1500)
  await sold('hamlet-refund', hamlet, -500, 'refund')
  await sold('seagull-1', other, 900, 'sale', Date.UTC(2026, 10, 14, 23, 30))
  // A payout empties part of the clearing account into the bank.
  await commit(unit => postEntries(unit.view(), {
    key: 'payout-1',
    source: { module: 'tickets', type: 'tickets.payout', id: 'payout-1' },
    kind: 'payout',
    entries: [{ account: { key: 'tickets.cash' }, amountMinor: 3000 }, { account: { key: 'tickets.clearing', scope: 'ppa_card' }, amountMinor: -3000 }],
  }))
})

const get = async (path: string, actor: ReturnType<typeof person>) => {
  const response = await call(handle, 'GET', path, { actor })
  return { status: response.status, headers: response.headers, text: await response.text() }
}

describe('a production\'s statement (FIN-04)', () => {
  it('splits income into sales and refunds, and totals it', async () => {
    const shown = await get(`/api/finance/productions/${hamlet}`, person(['finance.ledger.view']))
    const body = JSON.parse(shown.text)
    expect(body.production).toMatchObject({ id: hamlet, title: 'Hamlet' })
    expect(body.lines).toEqual([expect.objectContaining({ code: 'tickets.income', salesMinor: 3500, refundsMinor: -500, otherMinor: 0, netMinor: 3000 })])
    // And by performance; one no longer in the programme keeps its id and has no date.
    expect(body.performances).toEqual([expect.objectContaining({ performanceId: `prf_${hamlet}`, startsAt: null, salesMinor: 3500, refundsMinor: -500, netMinor: 3000 })])
  })

  it('is readable with the ledger granted on that production only, and on no other', async () => {
    const visiting = person([], { grants: [{ ability: 'finance.ledger.view', via: 'grant', record: { type: 'core.production', id: hamlet } }] } as any)
    expect((await get(`/api/finance/productions/${hamlet}`, visiting)).status).toBe(200)
    expect((await get(`/api/finance/productions/${other}`, visiting)).status).toBe(403)
    expect((await get('/api/finance/productions', visiting)).status).toBe(403)
  })

  it('lists the productions with money in the ledger, by title', async () => {
    const listed = JSON.parse((await get('/api/finance/productions', person(['finance.ledger.view']))).text)
    expect(listed.productions).toEqual(expect.arrayContaining([
      expect.objectContaining({ productionId: hamlet, title: 'Hamlet', netMinor: 3000 }),
      expect.objectContaining({ productionId: other, title: 'The Seagull', netMinor: 900 }),
    ]))
  })
})

describe('the export (FIN-05)', () => {
  it('gives a CSV of entries with account codes for local days, inclusive', async () => {
    const treasurer = person(['finance.ledger.export'])
    const day = await get('/api/finance/export?from=2026-11-14&to=2026-11-14', treasurer)
    expect(day.status).toBe(200)
    expect(day.headers.get('content-type')).toMatch(/^text\/csv/)
    expect(day.headers.get('content-disposition')).toContain('ledger-2026-11-14-to-2026-11-14.csv')
    const lines = day.text.trim().split('\r\n')
    expect(lines[0]).toBe('Posting,Date,Kind,Source,Reverses,Account code,Account,Debit,Credit,Currency,Production,Performance')
    // 23:30 UTC on the 14th is still the 14th in London in November.
    expect(lines.slice(1)).toHaveLength(2)
    expect(lines.slice(1).some(l => /,2026-11-14,sale,tickets\.order:seagull-1,,tickets\.income,Ticket income,,9\.00,GBP,prd_other,prf_prd_other$/.test(l))).toBe(true)
    expect(lines.slice(1).some(l => /,tickets\.clearing\.ppa_card,Card clearing,9\.00,,GBP,,$/.test(l))).toBe(true)
    const all = await get('/api/finance/export?from=2026-11-01&to=2026-11-30', treasurer)
    expect(all.text.trim().split('\r\n')).toHaveLength(1 + 5 * 2)
  })

  it('needs the export ability, and refuses a range that runs backwards', async () => {
    expect((await get('/api/finance/export?from=2026-11-01&to=2026-11-30', person(['finance.ledger.view']))).status).toBe(403)
    const backwards = await get('/api/finance/export?from=2026-11-30&to=2026-11-01', person(['finance.ledger.export']))
    expect(backwards.status).toBe(422)
    expect(JSON.parse(backwards.text).code).toBe('finance.export.backwards')
  })
})

describe('reconciliation (FIN-06, totals)', () => {
  it('shows what each clearing account holds after its payouts', async () => {
    const body = JSON.parse((await get('/api/finance/reconcile', person(['finance.ledger.view']))).text)
    expect(body.accounts).toEqual([expect.objectContaining({ code: 'tickets.clearing.ppa_card', balanceMinor: 2000 + 1500 - 500 + 900 - 3000, paidOutMinor: 3000, lastPayoutAt: NOV_16 })])
    expect(body.payouts).toEqual([{ postingId: expect.any(String), name: expect.any(String), currency: 'GBP', outMinor: 3000, feesMinor: 0, occurredAt: NOV_16 }])
  })
})
