// REP-09 to REP-11: a copy is a run on the bulk lane that answers exactly the question it was asked
// (R4), is claimed once (R3), opens only for someone who may read its figures today (R6), downloads
// as a CSV audited as an export, and expires into a row with no files (R7).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setClock, type Actor } from '#kit'
import { setAccessProvider } from '#kit/access'
import { resetRateLimits } from '#kit/ratelimit'
import queueCopy from '../../server/api/reports/runs/index.post'
import listCopies from '../../server/api/reports/runs/index.get'
import openCopy from '../../server/api/reports/runs/[id]/index.get'
import copyCsv from '../../server/api/reports/runs/[id]/csv.get'
import { expireRuns, runReport } from '../../server/runs'
import { call, deliver, inContext, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { house, NOV_16, ready, type House } from '../../../box-office/tests/integration/stage'

const handle = server({
  'POST /api/reports/runs': queueCopy,
  'GET /api/reports/runs': listCopies,
  'GET /api/reports/runs/:id': openCopy,
  'GET /api/reports/runs/:id/csv': copyCsv,
})
const reader = person(['reports.report.view', 'box-office.report.view', 'reports.run.export'])
const SALES = 'box-office.sales-and-attendance'
let h: House

// A job reads as the person who asked; here their grants come from the actor the test made.
const known = new Map<string, Actor>([[reader.accountId!, reader]])
const as = (actor: Actor) => (known.set(actor.accountId!, actor), actor)

const send = async (method: string, path: string, actor: Actor = reader, body?: unknown) => {
  const response = await call(handle, method, path, { actor, body })
  const type = response.headers.get('content-type') ?? ''
  return { status: response.status, body: type.includes('json') ? await response.json() as any : await response.text() }
}
const copy = async (actor: Actor = reader) => {
  const queued = await send('POST', '/api/reports/runs', actor, { report: SALES, scope: `production:${h.productionId}`, by: 'performance' })
  expect(queued.status, JSON.stringify(queued.body)).toBe(200)
  return queued.body.id as string
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  setAccessProvider({ ...testAccess, grants: async actor => known.get(actor.accountId ?? '')?.grants ?? actor.grants ?? [] })
  await ready()
  await setModule('reports', true)
  h = await house(40, { startsAt: Date.UTC(2026, 10, 20, 19, 30) })
})
afterAll(() => setAccessProvider(testAccess))

describe('keeping a copy', () => {
  it('queues a run with its question worked out, then works it out on the bulk lane', async () => {
    const id = await copy()
    const [queued] = await rows<{ state: string, question: string }>('SELECT state, question FROM reports_runs WHERE id = ?', id)
    expect(queued!.state).toBe('queued')
    expect(JSON.parse(queued!.question)).toMatchObject({ report: SALES, by: 'performance', scope: { kind: 'production', id: h.productionId }, period: { rule: 'scope' } })
    await deliver()
    const opened = await send('GET', `/api/reports/runs/${id}`)
    expect(opened.status, JSON.stringify(opened.body)).toBe(200)
    expect(opened.body).toMatchObject({ state: 'done', rows: 1, mine: true, unavailable: [] })
    expect(opened.body.table.totals['box-office.capacity']).toEqual({ state: 'ok', amounts: [{ value: 40 }] })
    expect(opened.body.table.rows[0].label).toMatch(/^.+, Fri,? 20 Nov 2026,? 19:30$/)
    expect(opened.body.headline).toEqual(expect.arrayContaining([{ measure: 'box-office.capacity', value: 40 }]))
  })

  it('is claimed once: a second message for the same run changes nothing (R3)', async () => {
    const id = await copy()
    await deliver()
    await inContext(() => runReport(id), { kind: 'job' })
    expect(await rows('SELECT slot FROM core_files WHERE owner_type = ? AND owner_id = ? ORDER BY slot', 'reports.run', id)).toEqual([{ slot: 'reports.run-csv' }, { slot: 'reports.run-data' }])
  })

  it('refuses a report the person cannot see any figure of', async () => {
    const queued = await send('POST', '/api/reports/runs', as(person(['reports.report.view'])), { report: SALES, scope: `production:${h.productionId}` })
    expect(queued.status).toBe(404)
  })
})

describe('the CSV (REP-09)', () => {
  it('says its question first, then the table and its totals, and is audited as an export', async () => {
    const id = await copy()
    await deliver()
    const csv = await send('GET', `/api/reports/runs/${id}/csv`)
    expect(csv.status).toBe(200)
    const lines = (csv.body as string).split('\r\n')
    expect(lines[1]).toMatch(/^Question,".+, 20 November 2026, by performance"$/)
    expect(lines).toContainEqual(expect.stringMatching(/^Performance,Tickets sold,.+,Gross takings \(GBP\),Net takings \(GBP\)$/))
    expect(lines).toContainEqual(expect.stringMatching(/^Total,0,0,0,40,0\.0,0\.00,0\.00$/))
    expect(await rows("SELECT action FROM core_audit WHERE record_type = 'reports.run' AND record_id = ? AND action = 'export'", id)).toHaveLength(1)
  })
})

describe('opening a copy (R6)', () => {
  it('needs the figures\' abilities today, and lists only what may be opened', async () => {
    const id = await copy()
    await deliver()
    const stranger = as(person(['reports.report.view', 'reports.run.view']))
    expect((await send('GET', `/api/reports/runs/${id}`, stranger)).status).toBe(404)
    expect((await send('GET', '/api/reports/runs', stranger)).body.runs).toEqual([])
    const manager = as(person(['reports.report.view', 'reports.run.view', 'box-office.report.view']))
    expect((await send('GET', `/api/reports/runs/${id}`, manager)).body).toMatchObject({ state: 'done', mine: false })
    expect((await send('GET', '/api/reports/runs', manager)).body.runs.map((r: { id: string }) => r.id)).toContain(id)
    // The person who asked, having lost the figure's ability, cannot open their own copy.
    const lapsed = as({ ...reader, grants: reader.grants!.filter(g => g.ability !== 'box-office.report.view') })
    expect((await send('GET', `/api/reports/runs/${id}`, lapsed)).status).toBe(404)
    known.set(reader.accountId!, reader)
  })
})

describe('expiry (R7, REP-11)', () => {
  it('marks copies past reports.runs.keep-for expired, keeping the row without its files', async () => {
    const id = await copy()
    await deliver()
    await rows('UPDATE reports_runs SET finished_at = ? WHERE id = ?', Date.UTC(2024, 0, 1), id)
    await inContext(() => expireRuns(), { kind: 'job' })
    const opened = await send('GET', `/api/reports/runs/${id}`)
    expect(opened.body).toMatchObject({ state: 'expired', table: null })
    expect((await send('GET', `/api/reports/runs/${id}/csv`)).status).toBe(409)
  })
})
