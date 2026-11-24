// REP-35, REP-44, REP-45 (rules P1 to P8): a people report reads figures per person through core,
// is never shared, keeps a copy as account ids and numbers, downloads a CSV made on the fly, goes
// stale on a merge, is reached by erasure and expires after reports.people.keep-for.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock, type Actor } from '#kit'
import { setAccessProvider } from '#kit/access'
import { resetRateLimits } from '#kit/ratelimit'
import saveReport from '../../server/api/reports/definitions/index.post'
import listReports from '../../server/api/reports/definitions/index.get'
import oneReport from '../../server/api/reports/definitions/[id]/index.get'
import readPeople from '../../server/api/reports/people/index.get'
import keepPeople from '../../server/api/reports/people/runs/index.post'
import peopleCsv from '../../server/api/reports/people/runs/[id]/csv.get'
import openCopy from '../../server/api/reports/runs/[id]/index.get'
import queueCopy from '../../server/api/reports/runs/index.post'
import handler from '../../server/contributions/core.merge-handler/person-rows'
import { expireRuns } from '../../server/runs'
import { erasurePlan } from '../../../core/server/identity/erasure'
import { minutes } from '../../../../tests/fixtures/modules/rota/server/contributions/core.person-measure/minutes'
import { call, env, inContext, person, rows, server, setModule, testAccess } from '../../../../tests/integration/helpers'
import { ready } from '../../../box-office/tests/integration/stage'

const handle = server({
  'POST /api/reports/definitions': saveReport,
  'GET /api/reports/definitions': listReports,
  'GET /api/reports/definitions/:id': oneReport,
  'GET /api/reports/people': readPeople,
  'POST /api/reports/people/runs': keepPeople,
  'GET /api/reports/people/runs/:id/csv': peopleCsv,
  'GET /api/reports/runs/:id': openCopy,
  'POST /api/reports/runs': queueCopy,
})
const NOV_24 = Date.UTC(2026, 10, 24, 12)
const manager = person(['reports.report.create', 'reports.people.export', 'rota.hours.view'])
const plain = person(['reports.report.create', 'rota.hours.view'])
const known = new Map<string, Actor>([[manager.accountId!, manager], [plain.accountId!, plain]])
const alex = newId('acc')
const sam = newId('acc')

const send = async (method: string, path: string, actor: Actor = manager, body?: unknown) => {
  const response = await call(handle, method, path, { actor, body })
  const type = response.headers.get('content-type') ?? ''
  return { status: response.status, body: type.includes('json') ? await response.json() as any : await response.text() }
}
const report = (changes: Record<string, unknown> = {}) => ({ kind: 'people', name: `Volunteer hours ${newId('tst')}`, columns: [{ measure: 'rota.minutes' }], scopeKind: 'none', periodRule: 'chosen', ...changes })
const saved = async () => (await send('POST', '/api/reports/definitions', manager, report())).body.id as string
const dates = 'period=chosen&from=2026-08-01&to=2026-11-30'

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await ready()
  setAccessProvider({ ...testAccess, grants: async actor => known.get(actor.accountId ?? '')?.grants ?? actor.grants ?? [] })
  await setModule('reports', true)
  await setModule('rota', true)
  for (const [id, name] of [[alex, 'Alex Usher'], [sam, 'Sam Steward']]) {
    await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at) VALUES (?, ?, \'self\', ?)').bind(id, name, NOV_24).run()
  }
  Object.assign(minutes, { answer: 'rows', rows: [{ person: alex, value: 120 }, { person: sam, value: 300 }], asked: [] })
})
afterAll(async () => {
  setAccessProvider(testAccess)
  await setModule('rota', false)
})

describe('making a people report (P1, P3, P8)', () => {
  it('needs reports.people.view, allows no formulas, sharing, pivots or charts, and at most six figures', async () => {
    expect((await send('POST', '/api/reports/definitions', plain, report())).status).toBe(403)
    const shared = await send('POST', '/api/reports/definitions', manager, report({ shareRole: newId('rol') }))
    expect(shared.body.code).toBe('reports.people.not-shareable')
    const odd = await send('POST', '/api/reports/definitions', manager, report({ columns: [{ measure: 'rota.minutes' }, { formula: 'C1 × 2', label: 'Double' }], acrossBy: 'month', chart: 'bar' }))
    expect(odd.body.fields).toMatchObject({ 'columns.1': 'A report about people has no formulas.', 'acrossBy': expect.any(String), 'chart': expect.any(String) })
    const wide = await send('POST', '/api/reports/definitions', manager, report({ columns: Array.from({ length: 7 }, () => ({ measure: 'rota.minutes' })) }))
    expect(wide.body.fields.columns).toMatch(/at most 6/)
  })

  it('is listed only for holders of reports.people.view', async () => {
    const id = await saved()
    expect((await send('GET', '/api/reports/definitions')).body.saved).toContainEqual(expect.objectContaining({ id, kind: 'people' }))
    expect((await send('GET', `/api/reports/definitions/${id}`)).body).toMatchObject({ kind: 'people', columns: [{ id: 'rota.minutes', readable: true }] })
  })
})

describe('reading one (REP-35)', () => {
  it('names each person today, most first, with no total where the module offers none, and audits the read', async () => {
    const id = await saved()
    const read = await send('GET', `/api/reports/people?report=${id}&${dates}`)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body.rows.map((r: { name: string, values: number[] }) => [r.name, r.values[0]])).toEqual([['Sam Steward', 300], ['Alex Usher', 120]])
    expect(read.body.totals[0]).toEqual({ state: 'unavailable', reason: 'no-total' })
    expect(await rows("SELECT 1 FROM core_audit WHERE actor_account_id = ? AND action = 'read' AND ability = 'rota.hours.view'", manager.accountId)).not.toHaveLength(0)
    expect((await send('GET', `/api/reports/people?report=${id}&${dates}`, person(['reports.report.view']))).status).toBe(403)
  })
})

describe('keeping a copy (REP-44) and downloading it (REP-45)', () => {
  it('keeps account ids and numbers, opens with today\'s names, and is not queued as a figures copy', async () => {
    const id = await saved()
    expect((await send('POST', '/api/reports/runs', manager, { report: id, period: 'chosen', from: '2026-08-01', to: '2026-11-30' })).body.code).toBe('reports.run.people')
    const kept = await send('POST', '/api/reports/people/runs', manager, { report: id, period: 'chosen', from: '2026-08-01', to: '2026-11-30' })
    expect(kept.status, JSON.stringify(kept.body)).toBe(200)
    expect(await rows('SELECT account_id, measure, value FROM reports_person_rows WHERE run_id = ? ORDER BY value', kept.body.id)).toEqual([
      { account_id: alex, measure: 'rota.minutes', value: 120 },
      { account_id: sam, measure: 'rota.minutes', value: 300 },
    ])
    const opened = await send('GET', `/api/reports/runs/${kept.body.id}`)
    expect(opened.body).toMatchObject({ state: 'done', rows: 2, people: { rows: [{ name: 'Sam Steward' }, { name: 'Alex Usher' }] } })
    expect((await send('GET', `/api/reports/runs/${kept.body.id}`, person(['reports.report.view', 'reports.run.view']))).status).toBe(404)
  })

  it('downloads a CSV made now, headed as personal data, only with reports.people.export, audited as an export', async () => {
    const id = await saved()
    const kept = (await send('POST', '/api/reports/people/runs', manager, { report: id, period: 'chosen', from: '2026-08-01', to: '2026-11-30' })).body.id as string
    expect((await send('GET', `/api/reports/people/runs/${kept}/csv`, plain)).status).toBe(403)
    const csv = await send('GET', `/api/reports/people/runs/${kept}/csv`)
    expect(csv.status).toBe(200)
    const lines = (csv.body as string).split('\r\n')
    expect(lines[1]).toBe('Contains personal data: do not forward')
    expect(lines).toContain('Sam Steward,300')
    expect(await rows("SELECT 1 FROM core_audit WHERE record_id = ? AND action = 'export'", kept)).toHaveLength(1)
    expect(await rows('SELECT 1 FROM core_files WHERE owner_id = ?', kept)).toHaveLength(0)
  })
})

describe('merges, erasure and expiry (P5 to P7)', () => {
  it('marks a copy stale when someone in it is merged, and then refuses its download', async () => {
    const id = await saved()
    const kept = (await send('POST', '/api/reports/people/runs', manager, { report: id, period: 'chosen', from: '2026-08-01', to: '2026-11-30' })).body.id as string
    await inContext(async () => {
      const unit = createUnit()
      await handler.merge(unit.view(), { mergeId: newId('mrg'), survivorId: sam, mergedAccountId: alex })
      await unit.commit()
    })
    expect((await send('GET', `/api/reports/runs/${kept}`)).body.state).toBe('stale')
    expect((await send('GET', `/api/reports/people/runs/${kept}/csv`)).body.code).toBe('reports.run.stale')
  })

  it('is reached by erasure, which deletes the person\'s rows', () => {
    expect(erasurePlan().find(s => s.table === 'reports_person_rows')).toMatchObject({ action: 'delete' })
  })

  it('deletes the rows and marks the copy expired after reports.people.keep-for', async () => {
    const id = await saved()
    const kept = (await send('POST', '/api/reports/people/runs', manager, { report: id, period: 'chosen', from: '2026-08-01', to: '2026-11-30' })).body.id as string
    await rows('UPDATE reports_runs SET finished_at = ? WHERE id = ?', NOV_24 - 91 * 86_400_000, kept)
    await inContext(() => expireRuns(), { kind: 'job' })
    expect(await rows('SELECT state FROM reports_runs WHERE id = ?', kept)).toEqual([{ state: 'expired' }])
    expect(await rows('SELECT 1 FROM reports_person_rows WHERE run_id = ?', kept)).toHaveLength(0)
  })
})
