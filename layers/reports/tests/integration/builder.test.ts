// REP-12, REP-13, REP-33, REP-42, REP-43: a saved report of figures and formulas, a breakdown, a
// pivot across the top and a filter. Saving checks every rule at once and names the column at
// fault; a copy of it lays the pivot and the formulas out exactly as the page does.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newId, setClock, type Actor } from '#kit'
import { setAccessProvider } from '#kit/access'
import { resetRateLimits } from '#kit/ratelimit'
import listReports from '../../server/api/reports/definitions/index.get'
import saveReport from '../../server/api/reports/definitions/index.post'
import oneReport from '../../server/api/reports/definitions/[id]/index.get'
import changeReport from '../../server/api/reports/definitions/[id]/index.put'
import archiveReport from '../../server/api/reports/definitions/[id]/archive.post'
import reportForm from '../../server/api/reports/definitions/[id]/form.get'
import readFigure from '../../server/api/reports/figures.get'
import queueCopy from '../../server/api/reports/runs/index.post'
import openCopy from '../../server/api/reports/runs/[id]/index.get'
import copyCsv from '../../server/api/reports/runs/[id]/csv.get'
import { call, deliver, env, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { house, NOV_16, ready, type House } from '../../../box-office/tests/integration/stage'

const handle = server({
  'GET /api/reports/definitions': listReports,
  'POST /api/reports/definitions': saveReport,
  'GET /api/reports/definitions/:id': oneReport,
  'PUT /api/reports/definitions/:id': changeReport,
  'POST /api/reports/definitions/:id/archive': archiveReport,
  'GET /api/reports/definitions/:id/form': reportForm,
  'GET /api/reports/figures': readFigure,
  'POST /api/reports/runs': queueCopy,
  'GET /api/reports/runs/:id': openCopy,
  'GET /api/reports/runs/:id/csv': copyCsv,
})
const role = newId('rol')
const maker = person(['reports.report.create', 'box-office.report.view', 'reports.run.export'])
const colleague = person([], { grants: [{ ability: 'reports.report.view', via: `role:${role}` }, { ability: 'box-office.report.view', via: `role:${role}` }] })
const stranger = person(['reports.report.view', 'box-office.report.view'])
const known = new Map<string, Actor>([[maker.accountId!, maker]])
let h: House

const send = async (method: string, path: string, actor: Actor = maker, body?: unknown) => {
  const response = await call(handle, method, path, { actor, body })
  const type = response.headers.get('content-type') ?? ''
  return { status: response.status, body: type.includes('json') ? await response.json() as any : await response.text() }
}

const report = (changes: Record<string, unknown> = {}) => ({
  name: 'Seats by month',
  columns: [{ measure: 'box-office.tickets-issued' }, { measure: 'box-office.capacity' }, { formula: 'C1 ÷ C2', label: 'Filled' }, { formula: 'C2 × 2', label: 'Double' }],
  rowsBy: 'performance',
  acrossBy: 'month',
  scopeKind: 'production',
  periodRule: 'scope',
  ...changes,
})

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  setAccessProvider({ ...testAccess, grants: async actor => known.get(actor.accountId ?? '')?.grants ?? actor.grants ?? [] })
  await ready()
  await setModule('reports', true)
  await env.DB.prepare("INSERT INTO core_roles (id, key, name, expiry_rule, created_at) VALUES (?, 'treasury', 'Treasury', 'none', 0)").bind(role).run()
  h = await house(40, { startsAt: Date.UTC(2026, 10, 20, 19, 30) })
  await house(30, { startsAt: Date.UTC(2026, 11, 4, 19, 30), of: h })
})
afterAll(() => setAccessProvider(testAccess))

describe('saving a report (REP-12)', () => {
  it('checks every rule at once and names each column at fault', async () => {
    const refused = await send('POST', '/api/reports/definitions', maker, report({
      columns: [{ measure: 'box-office.capacity' }, { formula: 'C1 + C3', label: 'Later' }, { measure: 'box-office.gross' }, { formula: 'C1 + C3', label: 'Mixed' }, { measure: 'front-of-house.unknown' }],
      rowsBy: 'box-office.ticket-type',
      filter: { key: 'venue', values: ['ven_1'] },
    }))
    expect(refused.status).toBe(422)
    expect(refused.body.fields).toMatchObject({
      'columns.1': expect.stringMatching(/only the columns before it \(at character 6\)/),
      'columns.3': expect.stringMatching(/same kind/),
      'columns.4': 'Choose a figure you can see.',
      'rowsBy': 'Capacity cannot be broken down this way.',
      'filter': 'Capacity cannot be narrowed this way.',
    })
  })

  it('saves figures and formulas with their units, and refuses a second report of the same name', async () => {
    const saved = await send('POST', '/api/reports/definitions', maker, report())
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const [row] = await rows<{ columns: string }>('SELECT columns FROM reports_definitions WHERE id = ?', saved.body.id)
    expect(JSON.parse(row!.columns)).toEqual([{ measure: 'box-office.tickets-issued' }, { measure: 'box-office.capacity' }, { formula: 'C1 ÷ C2', label: 'Filled', unit: 'percent' }, { formula: 'C2 × 2', label: 'Double', unit: 'count' }])
    const again = await send('POST', '/api/reports/definitions', maker, report({ name: 'SEATS BY MONTH' }))
    expect(again.body.code).toBe('reports.definition.name-taken')
  })
})

describe('who sees a saved report (D4, REP-13)', () => {
  it('its maker, and holders of the role it is shared with; nobody else', async () => {
    const { body } = await send('POST', '/api/reports/definitions', maker, report({ name: 'Shared seats', shareRole: role }))
    known.set(colleague.accountId!, colleague)
    expect((await send('GET', '/api/reports/definitions', maker)).body.saved).toContainEqual(expect.objectContaining({ id: body.id, mine: true, shared: true, editable: true }))
    expect((await send('GET', '/api/reports/definitions', colleague)).body.saved).toContainEqual(expect.objectContaining({ id: body.id, mine: false, editable: false }))
    expect((await send('GET', '/api/reports/definitions', stranger)).body.saved.map((s: { id: string }) => s.id)).not.toContain(body.id)
    expect((await send('GET', `/api/reports/definitions/${body.id}`, stranger)).status).toBe(404)
    expect((await send('GET', `/api/reports/definitions/${body.id}`, colleague)).body).toMatchObject({ source: 'saved', saved: { editable: false } })
    expect((await send('PUT', `/api/reports/definitions/${body.id}`, colleague, report({ name: 'Taken over' }))).status).toBe(403)
  })

  it('archives with an undo, and its maker can change it', async () => {
    const { body } = await send('POST', '/api/reports/definitions', maker, report({ name: 'To archive' }))
    expect((await send('POST', `/api/reports/definitions/${body.id}/archive`, maker, { archived: true })).status).toBe(200)
    expect((await send('GET', '/api/reports/definitions', maker)).body.saved).toContainEqual(expect.objectContaining({ id: body.id, archived: true }))
    expect((await send('POST', `/api/reports/definitions/${body.id}/archive`, maker, { archived: false })).status).toBe(200)
    expect((await send('PUT', `/api/reports/definitions/${body.id}`, maker, report({ name: 'Renamed', acrossBy: null, chart: 'bar' }))).status).toBe(200)
    expect((await send('GET', `/api/reports/definitions/${body.id}/form`, maker)).body).toMatchObject({ name: 'Renamed', acrossBy: null, chart: 'bar', columns: [{ measure: 'box-office.tickets-issued' }, { measure: 'box-office.capacity' }, { formula: 'C1 ÷ C2', label: 'Filled' }, { formula: 'C2 × 2', label: 'Double' }] })
  })

  it('starts a copy of a ready-made report from its figures (K2)', async () => {
    const draft = await send('GET', '/api/reports/definitions/box-office.sales-and-attendance/form', maker)
    expect(draft.body).toMatchObject({ basedOn: 'box-office.sales-and-attendance', rowsBy: 'performance', columns: expect.arrayContaining([{ measure: 'box-office.capacity' }]) })
  })
})

describe('pivots, formulas and filters on a copy (REP-33, REP-42, REP-43)', () => {
  it('reads two keys at once and narrows by a declared filter', async () => {
    const seen = await send('GET', `/api/reports/figures?id=box-office.capacity&from=2026-11-01&to=2026-12-31&scope=production:${h.productionId}&by=performance,month`)
    expect(seen.body.state, JSON.stringify(seen.body)).toBe('ok')
    expect(seen.body.rows.map((r: { keys: Record<string, string>, value: number }) => [r.keys.month, r.value]).sort()).toEqual([['2026-11', 40], ['2026-12', 30]])
    const narrowed = await send('GET', '/api/reports/figures?id=box-office.tickets-issued&from=2026-11-01&to=2026-12-31&by=box-office.channel&filter=box-office.channel:desk')
    expect(narrowed.body).toMatchObject({ state: 'ok', rows: [] })
    expect((await send('GET', '/api/reports/figures?id=box-office.capacity&from=2026-11-01&to=2026-12-31&filter=box-office.channel:desk')).body.code).toBe('core.measure.filter-not-declared')
  })

  it('lays each column out under each month with the totals last, and works formulas out from the totals', async () => {
    const { body: saved } = await send('POST', '/api/reports/definitions', maker, report({ name: 'Pivot copy', scopeId: h.productionId }))
    const queued = await send('POST', '/api/reports/runs', maker, { report: saved.id, by: 'performance' })
    expect(queued.status, JSON.stringify(queued.body)).toBe(200)
    await deliver()
    const copy = await send('GET', `/api/reports/runs/${queued.body.id}`)
    expect(copy.body.state, JSON.stringify(copy.body)).toBe('done')
    const table = copy.body.table
    expect(table.groups.map((g: { value: string | null }) => g.value)).toEqual(['2026-11', '2026-12', null])
    expect(table.rows).toHaveLength(2)
    expect(table.totals['1|']).toEqual({ state: 'ok', amounts: [{ value: 70 }] })
    expect(table.totals['3|']).toEqual({ state: 'ok', amounts: [{ value: 140 }] })
    expect(table.totals['3|2026-12']).toEqual({ state: 'ok', amounts: [{ value: 60 }] })
    expect(table.totals['2|']).toEqual({ state: 'ok', amounts: [{ value: 0 }] })
    // A performance in November has nothing in December: its formula there divides by nought.
    const november = table.rows.find((r: { cells: Record<string, unknown> }) => (r.cells['1|2026-11'] as { amounts: { value: number }[] }).amounts[0]!.value === 40)
    expect(november.cells['2|2026-12']).toEqual({ state: 'unavailable', reason: 'no-value' })
    const csv = (await send('GET', `/api/reports/runs/${queued.body.id}/csv`)).body as string
    expect(csv.split('\r\n')).toContainEqual(expect.stringMatching(/^Performance,November 2026 Tickets issued,November 2026 Capacity,November 2026 Filled,November 2026 Double,December 2026 Tickets issued,.*,Total Double$/))
  })
})
