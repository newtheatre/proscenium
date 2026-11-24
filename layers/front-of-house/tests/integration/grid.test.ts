// The rota grid (FH-48): a template applied to several days as one batch, with local times and an
// end past midnight; removal cancels untaken shifts and lists taken ones; copy; the grid's rows.
import { beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { rows } from '../../../../tests/integration/helpers'
import { NOV_16, duty, ready, req, shiftRow, volunteer } from './stage'

let venueId = ''
let spaceId = ''
let templateId = ''
let steward = ''
let bar = ''

beforeAll(async () => {
  await ready()
  setClock(NOV_16)
  const venue = await req('POST', '/api/core/venues', { name: 'Festival hub' })
  venueId = venue.body.venueId
  spaceId = venue.body.spaceId
  steward = await duty('Steward')
  bar = await duty('Bar')
  const t = await req('POST', '/api/front-of-house/rota-templates', { name: 'Festival hub night', lines: [{ dutyId: steward, places: 3 }, { dutyId: bar, places: 2 }] })
  expect(t.status, JSON.stringify(t.body)).toBe(200)
  templateId = t.body.templateId
})

const batch = (body: Record<string, unknown>) => req('POST', '/api/front-of-house/batches', { templateId, venueId, spaceId, title: 'Hub', callTime: '18:00', endTime: '23:00', ...body })

describe('batches', () => {
  it('makes one draft shift per day per template line, at local times across the clock change', async () => {
    const made = await batch({ days: ['2027-03-27', '2027-03-28'] })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.shiftIds).toHaveLength(4)
    const got = await rows<{ call_at: number, ends_at: number, state: string, batch_id: string, space_id: string }>('SELECT call_at, ends_at, state, batch_id, space_id FROM front_of_house_shifts WHERE batch_id = ? ORDER BY call_at', made.body.batchId)
    // 18:00 GMT on 27 March, then 18:00 BST on 28 March.
    expect(got.map(r => r.call_at)).toEqual([Date.UTC(2027, 2, 27, 18), Date.UTC(2027, 2, 27, 18), Date.UTC(2027, 2, 28, 17), Date.UTC(2027, 2, 28, 17)])
    expect(got.every(r => r.state === 'draft' && r.space_id === spaceId)).toBe(true)
    const [b] = await rows<{ made: number, days: string }>('SELECT made, days FROM front_of_house_shift_batches WHERE id = ?', made.body.batchId)
    expect(b).toEqual({ made: 4, days: '["2027-03-27","2027-03-28"]' })
  })

  it('runs an end before the call time into the next morning', async () => {
    const made = await batch({ days: ['2027-04-10'], callTime: '22:00', endTime: '02:00' })
    const s = await shiftRow(made.body.shiftIds[0])
    expect(s.call_at).toBe(Date.UTC(2027, 3, 10, 21))
    expect(s.ends_at).toBe(Date.UTC(2027, 3, 11, 1))
  })

  it('refuses an archived template, too many days and a space outside the venue', async () => {
    expect((await batch({ days: Array.from({ length: 32 }, (_, i) => `2027-05-${String(i % 31 + 1).padStart(2, '0')}`) })).status).toBe(422) // not-policy: one more than the bound
    const other = await req('POST', '/api/core/venues', { name: 'Elsewhere' })
    expect((await batch({ days: ['2027-05-01'], spaceId: other.body.spaceId })).body.code).toBe('front-of-house.batch.space')
  })

  it('removal cancels shifts nobody has taken and lists the rest', async () => {
    const made = await batch({ days: ['2027-06-01', '2027-06-02'] })
    expect((await req('POST', '/api/front-of-house/shifts/publish', { shiftIds: made.body.shiftIds })).status).toBe(200)
    const taken = made.body.shiftIds[0]
    const who = volunteer()
    expect((await req('POST', `/api/front-of-house/shifts/${taken}/sign-up`, {}, who)).body.state).toBe('confirmed')
    const removed = await req('POST', `/api/front-of-house/batches/${made.body.batchId}/remove`, {})
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    expect(removed.body.cancelled).toBe(3)
    expect(removed.body.kept).toMatchObject([{ shiftId: taken, placesTaken: 1 }])
    const states = await rows<{ id: string, state: string }>('SELECT id, state FROM front_of_house_shifts WHERE batch_id = ?', made.body.batchId)
    expect(states.filter(s => s.state === 'cancelled')).toHaveLength(3)
    expect(states.find(s => s.id === taken)!.state).toBe('published')
    expect((await req('POST', `/api/front-of-house/batches/${made.body.batchId}/remove`, {})).body.code).toBe('front-of-house.batch.removed')
    expect((await req('GET', '/api/front-of-house/batches')).body.batches.find((b: { id: string }) => b.id === made.body.batchId)).toBeUndefined()
  })
})

describe('the grid', () => {
  it('lays occasion shifts by show night and venue and duty, and copies a shift to other days', async () => {
    const made = await batch({ days: ['2027-07-01'], callTime: '23:30', endTime: '03:00', title: 'Late' })
    const [late] = await rows<{ id: string }>('SELECT id FROM front_of_house_shifts WHERE batch_id = ? AND duty_id = ?', made.body.batchId, steward)
    const copied = await req('POST', `/api/front-of-house/shifts/${late!.id}/copy`, { days: ['2027-07-02', '2027-07-03'] })
    expect(copied.status, JSON.stringify(copied.body)).toBe(200)
    expect(copied.body.shiftIds).toHaveLength(2)
    const copy = await shiftRow(copied.body.shiftIds[1])
    expect([copy.call_at, copy.ends_at, copy.batch_id]).toEqual([Date.UTC(2027, 6, 3, 22, 30), Date.UTC(2027, 6, 4, 2), null])
    const grid = (await req('GET', `/api/front-of-house/grid?from=2027-07-01&to=2027-07-03&venueId=${venueId}`)).body
    expect(grid.days).toEqual(['2027-07-01', '2027-07-02', '2027-07-03'])
    const stewards = grid.rows.find((r: { dutyId: string }) => r.dutyId === steward)
    expect(Object.keys(stewards.cells).sort()).toEqual(['2027-07-01', '2027-07-02', '2027-07-03'])
    expect(grid.rows.find((r: { dutyId: string }) => r.dutyId === bar).cells).toHaveProperty(['2027-07-01'])
    const unfilled = (await req('GET', `/api/front-of-house/grid?from=2027-07-01&to=2027-07-01&venueId=${venueId}&dutyId=${bar}&unfilled=1`)).body
    expect(unfilled.rows).toHaveLength(1)
  })
})
