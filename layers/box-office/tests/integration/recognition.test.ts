// Recognising ticket income (FIN-01, FIN-02; Box office specification, part 3, "The ledger"): money
// paid for tickets stays deferred until the performance has taken place; the daily task then moves
// it to income, once; and a period with a performance still waiting says so when it is closed.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, createUnit, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { env, inContext, rows, setModule } from '../../../../tests/integration/helpers'
import recogniseIncome from '../../server/tasks/recognise-income'
import closeCheck from '../../server/contributions/finance.period-close-check/unrecognised-income'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const DAY = 86_400_000
const balance = async (key: string, performanceId: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ? AND e.performance_id = ?', key, performanceId))[0]!.total
const runTask = () => inContext(() => (recogniseIncome as unknown as () => Promise<void>)(), { kind: 'job' })
let card: string
let guests = 0

/** A paid order of `quantity` full-price tickets. */
async function sell(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const started = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/checkout`, { expectedTotalMinor: made.basket.totalMinor, email: `income${++guests}@example.org` }, null, { 'x-basket-token': made.basket.token })
  expect(started.body.state, JSON.stringify(started.body)).toBe('awaiting_payment')
  const attemptId = await inContext(async () => {
    const unit = createUnit()
    const attempt = addAttempt(unit.view(), { intentId: started.body.intentId, providerAccountId: card, method: 'card_online', amountMinor: made.basket.totalMinor })
    await unit.commit()
    return attempt.id
  })
  expect(await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))).toMatchObject({ settled: true })
}

const takePlace = (h: House) => env.DB.prepare("UPDATE core_performances SET state = 'completed', completed_at = ends_at WHERE id = ?").bind(h.performanceId).run()

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await setModule('cardco', true)
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
})

describe('ticket income', () => {
  it('stays deferred until the performance has taken place, then moves to income once', async () => {
    const startsAt = NOV_16 + DAY
    const h = await house(10, { startsAt })
    const other = await house(10, { startsAt: startsAt + 30 * DAY })
    await sell(h, 2)
    await sell(other, 1)
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-2400)

    // Before it has taken place, a run moves nothing.
    await runTask()
    expect(await balance('box-office.ticket-income', h.performanceId)).toBe(0)

    advanceClock(2 * DAY)
    await takePlace(h)
    const period = { id: 'per_test', startsOn: '2026-11-01', endsOn: '2026-11-30', startsAt: Date.UTC(2026, 10, 1), endsAt: Date.UTC(2026, 11, 1) }
    expect(await inContext(() => closeCheck.blockers(period))).toHaveLength(1)

    await runTask()
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(0)
    expect(await balance('box-office.ticket-income', h.performanceId)).toBe(-2400)
    expect(await rows("SELECT p.kind, p.source_module, e.production_id FROM finance_postings p JOIN finance_entries e ON e.posting_id = p.id JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'box-office.ticket-income' AND e.performance_id = ?", h.performanceId))
      .toEqual([{ kind: 'recognition', source_module: 'box-office', production_id: h.productionId }])
    // The performance still to come is untouched, and nothing holds up the close now.
    expect(await balance('box-office.deferred-ticket-income', other.performanceId)).toBe(-1200)
    expect(await balance('box-office.ticket-income', other.performanceId)).toBe(0)
    expect(await inContext(() => closeCheck.blockers(period))).toEqual([])

    // Run again, the same day or the next: nothing more to move.
    await runTask()
    advanceClock(DAY)
    await runTask()
    expect(await balance('box-office.ticket-income', h.performanceId)).toBe(-2400)
  })
})
