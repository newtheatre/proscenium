// What Payments gives Front of house for a performance (Box office specification, part 5): the tills
// of the performance's operating day on the board, and the cash-up of those closed in the night
// report. Payments answers by the operating day, so sessions of another day are left out.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import figure from '../../server/contributions/front-of-house.tonight-figure/tills'
import section from '../../server/contributions/front-of-house.report-section/tills'
import { performance, ready, req } from '../../../front-of-house/tests/integration/stage'
import { env, inContext, person, setModule } from '../../../../tests/integration/helpers'

const HOUR = 3_600_000
let p: Awaited<ReturnType<typeof performance>>

async function session(label: string, openedAt: number, state: 'open' | 'counting' | 'closed', cash?: { expected: number, counted: number, closedAt: number }) {
  await env.DB.prepare(`INSERT INTO payments_sessions (id, point_label, opened_by, opened_at, closed_at, state, float_minor, expected_cash_minor, counted_cash_minor, currency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'GBP', ?, ?)`).bind(newId('till'), label, newId('acc'), openedAt, cash?.closedAt ?? null, state, cash?.expected ?? null, cash?.counted ?? null, openedAt, openedAt).run()
}

beforeAll(async () => {
  await ready()
  await setModule('payments', true)
  p = await performance()
  // The night: one till cashed up 50p short, one still being counted.
  await session('Foyer desk', p.startsAt - 2 * HOUR, 'closed', { expected: 10_000, counted: 9_950, closedAt: p.startsAt + 3 * HOUR })
  await session('Box office desk', p.startsAt - HOUR, 'counting')
  // Another day's tills.
  await session('Foyer desk', p.startsAt - 48 * HOUR, 'closed', { expected: 500, counted: 500, closedAt: p.startsAt - 46 * HOUR })
  await session('Foyer desk', p.startsAt + 48 * HOUR, 'open')
})

describe('the tills figure on the board', () => {
  it('counts the tills open or being counted that day, and asks for attention while one is counted', async () => {
    expect(await inContext(() => figure.read(p.id))).toEqual({ value: 1, state: 'attention', to: '/console/payments/sessions?view=counting' })
  })

  it('appears on the board for someone who may see till sessions, and not for anyone else', async () => {
    const both = person(['front-of-house.shift.view', 'payments.session.view'])
    const board = await req('GET', `/api/front-of-house/performances/${p.id}/tonight`, undefined, both)
    expect(board.status, JSON.stringify(board.body)).toBe(200)
    expect(board.body.figures).toEqual([expect.objectContaining({ id: 'payments.tills', label: 'payments.figures.tills', value: 1, state: 'attention' })])
    const steward = person(['front-of-house.shift.view'])
    expect((await req('GET', `/api/front-of-house/performances/${p.id}/tonight`, undefined, steward)).body.figures).toEqual([])
  })
})

describe('the tills section of the night report', () => {
  it('gives the day\'s closed sessions, the cash expected, counted and the difference, and each till that was out', async () => {
    expect(await inContext(() => section.compile(p.id))).toEqual([
      { label: 'payments.report.sessions-closed', value: 1 },
      { label: 'payments.report.sessions-not-closed', value: 1 },
      { label: 'payments.report.expected', value: 10_000, unit: 'GBP' },
      { label: 'payments.report.counted', value: 9_950, unit: 'GBP' },
      { label: 'payments.report.difference', value: -50, unit: 'GBP' },
      { label: 'Foyer desk', value: -50, unit: 'GBP' },
    ])
  })
})
