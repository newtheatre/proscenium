// PAY-03 and the till (Box office specification, parts 3 and 4): a seller opens a session with a
// float, sells from every panel they may use in one payment, and cashes up; counting waits for every
// answer, a difference needs a reason and is posted, and above the limit someone else closes.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { addAttempt, recordAnswer } from '../../server/answers'
import sessionGet from '../../server/api/payments/session.get'
import sessionsPost from '../../server/api/payments/sessions.post'
import sessionsGet from '../../server/api/payments/sessions.get'
import recentGet from '../../server/api/payments/sessions/recent.get'
import countPost from '../../server/api/payments/sessions/[id]/count.post'
import closePost from '../../server/api/payments/sessions/[id]/close.post'
import summaryPost from '../../server/api/payments/till/summary.post'
import salePost from '../../server/api/payments/till/sale.post'
import attestPost from '../../server/api/payments/intents/[id]/attest.post'
import cancelPost from '../../server/api/payments/intents/[id]/cancel.post'
import receiptPost from '../../server/api/payments/intents/[id]/receipt.post'
import intentGet from '../../server/api/payments/intents/[id].get'
import methodsGet from '../../server/api/payments/methods.get'
import panelsGet from '../../server/api/payments/till/panels.get'
import tillMethodsGet from '../../server/api/payments/till/methods.get'
import { call, deliver, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 12)
let cash: string
let keys = 0

const handle = server({
  'GET /api/payments/session': sessionGet,
  'POST /api/payments/sessions': sessionsPost,
  'GET /api/payments/sessions': sessionsGet,
  'GET /api/payments/sessions/recent': recentGet,
  'POST /api/payments/sessions/:id/count': countPost,
  'POST /api/payments/sessions/:id/close': closePost,
  'POST /api/payments/till/summary': summaryPost,
  'POST /api/payments/till/sale': salePost,
  'POST /api/payments/intents/:id/attest': attestPost,
  'POST /api/payments/intents/:id/cancel': cancelPost,
  'POST /api/payments/intents/:id/receipt': receiptPost,
  'GET /api/payments/intents/:id': intentGet,
  'GET /api/payments/methods': methodsGet,
  'GET /api/payments/till/panels': panelsGet,
  'GET /api/payments/till/methods': tillMethodsGet,
})

const seller = (extra: string[] = ['tickets.orders.sell']) => person(['payments.session.open', 'payments.attempt.attest', ...extra])
const manager = person(['payments.session.close-any'])

async function post(path: string, actor: ReturnType<typeof person>, body: unknown = {}, idempotent = false) {
  const response = await call(handle, 'POST', path, { actor, body, headers: idempotent ? { 'idempotency-key': `k${++keys}` } : {} })
  return { status: response.status, body: await response.json() as any }
}

async function get(path: string, actor: ReturnType<typeof person>) {
  const response = await call(handle, 'GET', path, { actor })
  return { status: response.status, body: await response.json() as any }
}

/** Opens a session for the seller, sells tickets (and snacks) for cash, and returns the ids. */
async function sellForCash(actor: ReturnType<typeof person>, float: number, tickets: number, snacks?: number) {
  const opened = await post('/api/payments/sessions', actor, { pointLabel: 'Box office desk', floatMinor: float }, true)
  expect(opened.status).toBe(200)
  const panels = [{ basket: 'tickets', input: { amountMinor: tickets } }, ...(snacks ? [{ basket: 'snacks', input: { amountMinor: snacks } }] : [])]
  const sale = await post('/api/payments/till/sale', actor, { panels }, true)
  expect(sale.status).toBe(200)
  const paid = await post(`/api/payments/intents/${sale.body.intentId}/attest`, actor, { providerAccountId: cash, method: 'cash', tenderedMinor: tickets + (snacks ?? 0) }, true)
  expect(paid.body).toMatchObject({ settled: true })
  return { sessionId: opened.body.session.id as string, intentId: sale.body.intentId as string }
}

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'payments', 'tickets', 'snacks']) await setModule(id, true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await changeSetting(unit.view(), 'payments.cash.enabled', true, { reason: 'test', confirm: true }) // these take cash
    await unit.commit()
  })
  cash = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOV_16, NOV_16).run()
})

describe('opening a session', () => {
  it('opens one session per person with a float, and shows it', async () => {
    const me = seller()
    expect((await get('/api/payments/session', me)).body).toEqual({ mayOpen: true, mayViewAll: false, cashTaken: true, session: null, waiting: [], awaiting: [], unfinished: null, takings: [], sales: [], defaultSpaceId: null })
    const opened = await post('/api/payments/sessions', me, { pointLabel: 'Bar', floatMinor: 5000 }, true)
    expect(opened.body.session).toMatchObject({ state: 'open', floatMinor: 5000, expectedCashMinor: 5000, currency: 'GBP' })
    const again = await post('/api/payments/sessions', me, { pointLabel: 'Bar' }, true)
    expect(again).toMatchObject({ status: 409, body: { code: 'payments.session.already-open' } })
    expect((await get('/api/payments/session', me)).body.session.id).toBe(opened.body.session.id)
  })

  it('refuses a sale before a session is open, but sums the panels, so coming to the till opens nothing', async () => {
    const me = seller()
    const summary = await post('/api/payments/till/summary', me, { panels: [{ basket: 'tickets', input: { amountMinor: 100 } }] })
    expect(summary.body).toMatchObject({ amountMinor: 100 })
    expect((await get('/api/payments/session', me)).body.session).toBeNull()
    const sale = await post('/api/payments/till/sale', me, { panels: [{ basket: 'tickets', input: { amountMinor: 100 } }] }, true)
    expect(sale).toMatchObject({ status: 409, body: { code: 'payments.session.none' } })
  })
})

describe('the till', () => {
  it('sums the panels, takes one cash payment for both owners, and counts it in the session', async () => {
    const me = seller()
    await post('/api/payments/sessions', me, { pointLabel: 'Foyer', floatMinor: 1000 }, true)
    const panels = [{ basket: 'tickets', input: { amountMinor: 2400 } }, { basket: 'snacks', input: { amountMinor: 350 } }]
    expect((await post('/api/payments/till/summary', me, { panels })).body).toMatchObject({ amountMinor: 2750, panels: [{ basket: 'tickets', amountMinor: 2400 }, { basket: 'snacks', amountMinor: 350, ranAs: 'snacks' }] })
    expect((await get('/api/payments/methods', me)).body.methods).toContainEqual(expect.objectContaining({ providerAccountId: cash, method: 'cash' }))
    const sale = await post('/api/payments/till/sale', me, { panels }, true)
    expect(sale.body.amountMinor).toBe(2750)
    const paid = await post(`/api/payments/intents/${sale.body.intentId}/attest`, me, { providerAccountId: cash, method: 'cash', tenderedMinor: 3000 }, true)
    expect(paid.body).toMatchObject({ settled: true, changeMinor: 250 })
    const status = await get(`/api/payments/intents/${sale.body.intentId}`, me)
    expect(status.body).toMatchObject({ state: 'succeeded', paidMinor: 2750 })
    expect((await get('/api/payments/session', me)).body.session.expectedCashMinor).toBe(3750)
  })

  it('lists the panels the seller may use in order, each with its module and components', async () => {
    expect((await get('/api/payments/till/panels', seller())).body.panels).toEqual([
      { id: 'tickets', module: 'tickets', label: 'tickets.desk.label', tab: 'tickets.desk.label', icon: null, panel: 'TicketsTillPanel', livePanel: null },
      { id: 'snacks', module: 'snacks', label: 'snacks.desk.label', tab: 'snacks.desk.tab', icon: 'i-lucide-cookie', panel: 'SnacksTillPanel', livePanel: 'SnacksLiveTillPanel' },
    ])
    expect((await get('/api/payments/till/panels', seller([]))).body.panels.map((p: { id: string }) => p.id)).toEqual(['snacks'])
  })

  it('offers the desk methods the settings allow', async () => {
    const me = seller()
    expect((await get('/api/payments/till/methods', me)).body.methods).toContainEqual(expect.objectContaining({ providerAccountId: cash, method: 'cash' }))
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'payments.cash.enabled', false, { reason: 'test', confirm: true })
      await unit.commit()
    })
    expect((await get('/api/payments/till/methods', me)).body.methods.some((m: { method: string }) => m.method === 'cash')).toBe(false)
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'payments.cash.enabled', true, { reason: 'test', confirm: true })
      await unit.commit()
    })
  })

  it('offers only the panels the seller may use', async () => {
    const barOnly = seller([])
    await post('/api/payments/sessions', barOnly, { pointLabel: 'Bar' }, true)
    const refused = await post('/api/payments/till/sale', barOnly, { panels: [{ basket: 'tickets', input: { amountMinor: 900 } }] }, true)
    expect(refused).toMatchObject({ status: 403, body: { code: 'payments.till.no-panel' } })
    const allowed = await post('/api/payments/till/sale', barOnly, { panels: [{ basket: 'snacks', input: { amountMinor: 400 } }] }, true)
    expect(allowed.status).toBe(200)
  })

  it('cancels a sale nobody has paid towards, and releases it', async () => {
    const me = seller()
    await post('/api/payments/sessions', me, { pointLabel: 'Desk' }, true)
    const sale = await post('/api/payments/till/sale', me, { panels: [{ basket: 'tickets', input: { amountMinor: 1200 } }] }, true)
    expect((await post(`/api/payments/intents/${sale.body.intentId}/cancel`, me)).status).toBe(200)
    const [part] = await rows<{ owner_record: string }>('SELECT owner_record FROM payments_intent_parts WHERE intent_id = ?', sale.body.intentId)
    expect(await rows('SELECT state FROM tickets_orders WHERE id = ?', part!.owner_record)).toEqual([{ state: 'released' }])
  })
})

describe('a theatre that takes no cash', () => {
  const cashTaken = (on: boolean) => inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'payments.cash.enabled', on, { reason: 'test', confirm: true })
    await unit.commit()
  })

  it('opens sessions with no float, takes no cash, and closes them with nothing to count', async () => {
    await cashTaken(false)
    try {
      const me = seller()
      expect((await get('/api/payments/session', me)).body).toEqual({ mayOpen: true, mayViewAll: false, cashTaken: false, session: null, waiting: [], awaiting: [], unfinished: null, takings: [], sales: [], defaultSpaceId: null })
      expect(await post('/api/payments/sessions', me, { pointLabel: 'Desk', floatMinor: 2000 }, true)).toMatchObject({ status: 422, body: { code: 'payments.session.no-cash' } })
      const opened = await post('/api/payments/sessions', me, { pointLabel: 'Desk' }, true)
      expect(opened.body.session).toMatchObject({ state: 'open', floatMinor: 0, expectedCashMinor: 0, handlesCash: false })
      const sale = await post('/api/payments/till/sale', me, { panels: [{ basket: 'tickets', input: { amountMinor: 700 } }] }, true)
      expect(await post(`/api/payments/intents/${sale.body.intentId}/attest`, me, { providerAccountId: cash, method: 'cash', tenderedMinor: 700 }, true))
        .toMatchObject({ status: 409, body: { code: 'payments.attempt.method-unavailable' } })
      expect((await post(`/api/payments/intents/${sale.body.intentId}/cancel`, me)).status).toBe(200)
      const sessionId = opened.body.session.id as string
      expect((await post(`/api/payments/sessions/${sessionId}/count`, me)).body.session).toMatchObject({ state: 'counting', expectedCashMinor: 0, handlesCash: false })
      const closed = await post(`/api/payments/sessions/${sessionId}/close`, me, { countedMinor: 0 })
      expect(closed.body).toMatchObject({ varianceMinor: 0, session: { state: 'closed', handlesCash: false } })
      expect(await rows("SELECT id FROM finance_postings WHERE source_type = 'payments.session' AND source_id = ?", sessionId)).toEqual([])
    }
    finally {
      await cashTaken(true)
    }
  })

  it('still counts a session that held cash before cash was turned off', async () => {
    const me = seller()
    const { sessionId } = await sellForCash(me, 1000, 500)
    await cashTaken(false)
    try {
      expect((await get('/api/payments/session', me)).body.session).toMatchObject({ id: sessionId, handlesCash: true, expectedCashMinor: 1500 })
    }
    finally {
      await cashTaken(true)
    }
  })
})

describe('cashing up (PAY-03)', () => {
  it('waits for every answer before counting, and takes no payment once counting', async () => {
    const me = seller()
    const { sessionId } = await sellForCash(me, 0, 500)
    const sale = await post('/api/payments/till/sale', me, { panels: [{ basket: 'tickets', input: { amountMinor: 800 } }] }, true)
    const attemptId = await inContext(async () => {
      const unit = createUnit()
      const attempt = addAttempt(unit.view(), { intentId: sale.body.intentId, providerAccountId: cash, method: 'cash', amountMinor: 800 })
      await unit.commit()
      return attempt.id
    })
    expect(await post(`/api/payments/sessions/${sessionId}/count`, me)).toMatchObject({ status: 409, body: { code: 'payments.session.payment-waiting' } })
    // My session names the payment it waits for, and when it turns unknown (answer-within, 3 minutes).
    const mine = await get('/api/payments/session', me)
    expect(mine.body.waiting).toEqual([{ id: attemptId, method: 'cash', amountMinor: 800, currency: 'GBP', state: 'started', provider: 'Cash', startedAt: NOV_16, unknownAt: NOV_16 + 3 * 60_000 }])
    await inContext(() => recordAnswer(attemptId, { state: 'failed', failureCode: 'declined' }, { kind: 'person' }))
    const counting = await post(`/api/payments/sessions/${sessionId}/count`, me)
    expect(counting.body.session).toMatchObject({ state: 'counting', expectedCashMinor: 500 })
    const late = await post(`/api/payments/intents/${sale.body.intentId}/attest`, me, { providerAccountId: cash, method: 'cash' }, true)
    expect(late).toMatchObject({ status: 409, body: { code: 'payments.session.not-open' } })
  })

  it('closes with no difference and posts nothing', async () => {
    const me = seller()
    await env.DB.prepare("INSERT INTO core_accounts (id, name, origin, created_at) VALUES (?, 'Sam Seller', 'test', ?)").bind(me.accountId, NOV_16).run()
    const { sessionId } = await sellForCash(me, 2000, 1500)
    await post(`/api/payments/sessions/${sessionId}/count`, me)
    const closed = await post(`/api/payments/sessions/${sessionId}/close`, me, { countedMinor: 3500 })
    expect(closed.body).toMatchObject({ varianceMinor: 0, session: { state: 'closed', countedCashMinor: 3500, openedByName: 'Sam Seller', closedByName: 'Sam Seller' } })
    expect(await rows("SELECT id FROM finance_postings WHERE source_type = 'payments.session' AND source_id = ?", sessionId)).toEqual([])
    expect(await rows("SELECT payload FROM core_events WHERE name = 'payments.session.closed' AND payload LIKE ?", `%${sessionId}%`)).toHaveLength(1)
    expect((await get('/api/payments/session', me)).body).toEqual({ mayOpen: true, mayViewAll: false, cashTaken: true, session: null, waiting: [], awaiting: [], unfinished: null, takings: [], sales: [], defaultSpaceId: null })
  })

  it('needs a reason for a difference, and posts it to cash over and short', async () => {
    const me = seller()
    const { sessionId } = await sellForCash(me, 1000, 2000)
    await post(`/api/payments/sessions/${sessionId}/count`, me)
    expect(await post(`/api/payments/sessions/${sessionId}/close`, me, { countedMinor: 2700 })).toMatchObject({ status: 422, body: { code: 'payments.session.reason-needed' } })
    const closed = await post(`/api/payments/sessions/${sessionId}/close`, me, { countedMinor: 2700, varianceNote: 'Change given twice' })
    expect(closed.body).toMatchObject({ varianceMinor: -300, session: { varianceNote: 'Change given twice' } })
    const entries = await rows<{ system_key: string, amount_minor: number }>(`SELECT a.system_key, e.amount_minor FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id
      WHERE p.source_type = 'payments.session' AND p.source_id = ? AND p.kind = 'cash_variance' ORDER BY e.amount_minor`, sessionId)
    expect(entries).toEqual([{ system_key: 'payments.cash', amount_minor: -300 }, { system_key: 'payments.cash-variance', amount_minor: 300 }])
  })

  it('needs someone else to close a session whose difference is above the limit', async () => {
    const me = seller()
    const { sessionId } = await sellForCash(me, 0, 4000)
    await post(`/api/payments/sessions/${sessionId}/count`, me)
    const own = await post(`/api/payments/sessions/${sessionId}/close`, me, { countedMinor: 3000, varianceNote: 'Short' })
    expect(own).toMatchObject({ status: 409, body: { code: 'payments.session.second-person-needed' } })
    expect((await post(`/api/payments/sessions/${sessionId}/close`, seller(), { countedMinor: 3000, varianceNote: 'Short' })).status).toBe(403)
    const countersigned = await post(`/api/payments/sessions/${sessionId}/close`, manager, { countedMinor: 3000, varianceNote: 'Short: a note was missing' })
    expect(countersigned.body).toMatchObject({ varianceMinor: -1000, session: { state: 'closed', closedBy: manager.accountId } })
    const list = await get('/api/payments/sessions', manager)
    expect(list.body.rows.find((s: { id: string }) => s.id === sessionId)).toMatchObject({ expectedCashMinor: 4000, countedCashMinor: 3000, canClose: false })
    expect((await get('/api/payments/sessions/recent', manager)).body.sessions.at(-1)).toMatchObject({ id: sessionId, countedCashMinor: 3000 })
  })

  it('lists sessions newest first, filters by state, and offers closing only to someone allowed', async () => {
    const me = seller()
    const { sessionId } = await sellForCash(me, 0, 1500)
    await post(`/api/payments/sessions/${sessionId}/count`, me)
    const counting = await get('/api/payments/sessions?state=counting', manager)
    expect(counting.body.rows.map((s: { id: string }) => s.id)).toContain(sessionId)
    expect(counting.body.rows.every((s: { state: string }) => s.state === 'counting')).toBe(true)
    expect(counting.body.rows.find((s: { id: string }) => s.id === sessionId).canClose).toBe(true)
    const viewer = person(['payments.session.view'])
    expect((await get('/api/payments/sessions?state=counting', viewer)).body.rows.find((s: { id: string }) => s.id === sessionId).canClose).toBe(false)
    const all = await get('/api/payments/sessions', manager)
    const opened = all.body.rows.map((s: { openedAt: number }) => s.openedAt)
    expect(opened).toEqual([...opened].sort((a: number, b: number) => b - a))
    expect(all.body.total).toBeGreaterThanOrEqual(opened.length)
  })
})

describe('splitting a sale by item', () => {
  const panels = [{ basket: 'tickets', input: { amountMinor: 1000, quantity: 3 } }, { basket: 'snacks', input: { amountMinor: 350 } }]
  const plan = [
    { items: [{ basket: 'tickets', line: 0, quantity: 1 }, { basket: 'snacks', line: 0, quantity: 1 }] },
    { items: [{ basket: 'tickets', line: 0, quantity: 2 }] },
  ]
  const attest = (intentId: string, me: ReturnType<typeof person>, body: Record<string, unknown>) => post(`/api/payments/intents/${intentId}/attest`, me, { providerAccountId: cash, method: 'cash', ...body }, true)

  it('gives each person their items, takes exactly their share, and emails each their own receipt once all have paid', async () => {
    const me = seller()
    await post('/api/payments/sessions', me, { pointLabel: 'Foyer' }, true)
    const sale = await post('/api/payments/till/sale', me, { panels, splits: plan }, true)
    expect(sale.body.amountMinor).toBe(1350)
    const id = sale.body.intentId as string
    // The odd penny of three tickets at £10 goes to the first person.
    expect((await get(`/api/payments/intents/${id}`, me)).body.splits).toEqual([
      { position: 1, amountMinor: 684, paid: false, items: [{ label: 'Ticket', quantity: 1, amountMinor: 334 }, { label: 'Snacks', quantity: 1, amountMinor: 350 }] },
      { position: 2, amountMinor: 666, paid: false, items: [{ label: 'Ticket', quantity: 2, amountMinor: 666 }] },
    ])
    // Nobody types an amount, and a split sale needs to know who is paying.
    expect((await attest(id, me, { amountMinor: 500 })).status).toBe(422)
    expect((await attest(id, me, {})).body).toMatchObject({ code: 'payments.till.which-person' })

    expect((await attest(id, me, { split: 2, receipt: { email: 'second@example.com' } })).body).toMatchObject({ settled: false })
    expect((await attest(id, me, { split: 2 })).body).toMatchObject({ code: 'payments.till.person-paid' })
    // Receipts wait until the whole sale is paid, so one given back is never receipted.
    expect(await rows("SELECT address FROM core_notifications WHERE type_key LIKE 'payments.till-receipt%' AND subject_id = ?", id)).toEqual([])

    const last = await attest(id, me, { split: 1, receipt: { email: 'first@example.com' }, tenderedMinor: 1000 })
    expect(last.body).toMatchObject({ settled: true, changeMinor: 316 })
    // They go just after the sale, each in a unit of its own.
    await deliver()
    const sent = await rows<{ address: string, payload: string }>("SELECT address, payload FROM core_notifications WHERE type_key = 'payments.till-receipt' AND subject_id = ? ORDER BY address", id)
    expect(sent.map(s => s.address)).toEqual(['first@example.com', 'second@example.com'])
    expect(JSON.parse(sent[1]!.payload)).toMatchObject({ items: '2 × Ticket', amount: '£6.66', method: 'Cash' })
    // The owner is told who paid for which of its lines, with their address, at settle.
    expect((globalThis as { ticketsSplits?: unknown }).ticketsSplits).toEqual([
      { position: 1, receiptTo: 'first@example.com', receiptAccountId: null, items: [{ line: 0, key: 'all', quantity: 1 }] },
      { position: 2, receiptTo: 'second@example.com', receiptAccountId: null, items: [{ line: 0, key: 'all', quantity: 2 }] },
    ])
    // Once the receipts have gone, the addresses are gone.
    expect(await rows('SELECT receipt_to FROM payments_till_splits WHERE intent_id = ? AND receipt_to IS NOT NULL', id)).toEqual([])
    expect((await get(`/api/payments/intents/${id}`, me)).body).toMatchObject({ state: 'succeeded', splits: [{ paid: true }, { paid: true }] })
  })

  it('sends a whole sale\'s receipt, given before paying or while paying, and one asked for afterwards', async () => {
    const me = seller()
    await post('/api/payments/sessions', me, { pointLabel: 'Foyer' }, true)
    const first = await post('/api/payments/till/sale', me, { panels, receipt: { email: 'whole@example.com' } }, true)
    expect((await attest(first.body.intentId, me, {})).body).toMatchObject({ settled: true })
    await deliver()
    const [whole] = await rows<{ payload: string }>("SELECT payload FROM core_notifications WHERE address = 'whole@example.com'")
    expect(JSON.parse(whole!.payload)).toMatchObject({ items: '3 × Ticket, 1 × Snacks', amount: '£13.50', method: 'Cash' })

    const second = await post('/api/payments/till/sale', me, { panels }, true)
    expect((await attest(second.body.intentId, me, { receipt: { email: 'paying@example.com' } })).body).toMatchObject({ settled: true })
    await deliver()
    expect(await rows("SELECT 1 FROM core_notifications WHERE address = 'paying@example.com'")).toHaveLength(1)

    const third = await post('/api/payments/till/sale', me, { panels }, true)
    const receipt = `/api/payments/intents/${third.body.intentId}/receipt`
    expect((await post(receipt, me, { receipt: { email: 'later@example.com' } })).body).toMatchObject({ code: 'payments.intent.not-paid' })
    await attest(third.body.intentId, me, {})
    expect((await post(receipt, me, { receipt: { email: 'later@example.com' } })).body).toEqual({ sent: true })
    expect((await post(receipt, me, { receipt: { email: 'again@example.com' } })).body).toMatchObject({ code: 'payments.till.receipt-sent' })
    expect(await rows("SELECT 1 FROM core_notifications WHERE address = 'later@example.com'")).toHaveLength(1)
    expect(await rows('SELECT receipt_to FROM payments_till_splits WHERE intent_id = ? AND receipt_to IS NOT NULL', third.body.intentId)).toEqual([])
  })

  it('refuses a plan that leaves an item out, gives one twice, or splits a single item', async () => {
    const me = seller()
    await post('/api/payments/sessions', me, { pointLabel: 'Foyer' }, true)
    const short = await post('/api/payments/till/sale', me, { panels, splits: [plan[0], { items: [{ basket: 'tickets', line: 0, quantity: 1 }] }] }, true)
    expect(short).toMatchObject({ status: 422, body: { code: 'payments.till.bad-split' } })
    const twice = await post('/api/payments/till/sale', me, { panels, splits: [plan[0], { items: [{ basket: 'tickets', line: 0, quantity: 3 }] }] }, true)
    expect(twice).toMatchObject({ status: 422, body: { code: 'payments.till.bad-split' } })
    const one = [{ basket: 'tickets', input: { amountMinor: 1000 } }]
    const single = await post('/api/payments/till/sale', me, { panels: one, splits: [{ items: [{ basket: 'tickets', line: 0, quantity: 1 }] }, { items: [{ basket: 'tickets', line: 0, quantity: 1 }] }] }, true)
    expect(single).toMatchObject({ status: 422, body: { code: 'payments.till.split-one-item' } })
    // Nothing was made by the refused plans.
    expect((await get('/api/payments/session', me)).body.unfinished).toBeNull()
  })

  it('takes a sale that is not split whole, with no person or receipt address', async () => {
    const me = seller()
    await post('/api/payments/sessions', me, { pointLabel: 'Foyer' }, true)
    const sale = await post('/api/payments/till/sale', me, { panels }, true)
    expect((await attest(sale.body.intentId, me, { split: 1 })).body).toMatchObject({ code: 'payments.till.not-split' })
    expect((await attest(sale.body.intentId, me, {})).body).toMatchObject({ settled: true })
  })
})
