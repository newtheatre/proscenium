// REP-04: Reports lists the ready-made reports from modules that are on (K1), works out a report's
// dates from its period rule, and reads each figure live through readMeasure, leaving out what the
// reader may not see (M3). Nothing is written.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import listReports from '../../server/api/reports/definitions/index.get'
import oneReport from '../../server/api/reports/definitions/[id]/index.get'
import readFigure from '../../server/api/reports/figures.get'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { house, NOV_16, ready, type House } from '../../../box-office/tests/integration/stage'

const handle = server({ 'GET /api/reports/definitions': listReports, 'GET /api/reports/definitions/:id': oneReport, 'GET /api/reports/figures': readFigure })
const reader = person(['reports.report.view', 'box-office.report.view'])
const SALES = 'box-office.sales-and-attendance'
let h: House
let day: string

const get = async (path: string, actor = reader) => {
  const response = await call(handle, 'GET', path, { actor })
  return { status: response.status, body: await response.json() as any }
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await setModule('reports', true)
  h = await house(40, { startsAt: Date.UTC(2026, 10, 20, 19, 30) })
  day = (await rows<{ operating_day: string }>('SELECT operating_day FROM core_performances WHERE id = ?', h.performanceId))[0]!.operating_day
})

describe('ready-made reports (K1)', () => {
  it('lists Box office\'s Sales and attendance to someone who may read its figures', async () => {
    const seen = await get('/api/reports/definitions')
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body.reports).toContainEqual(expect.objectContaining({ id: SALES, area: 'box-office', scope: 'production', module: 'box-office' }))
    expect((await get('/api/reports/definitions', person(['reports.report.view']))).body.reports).toEqual([])
    expect((await get('/api/reports/definitions', person(['box-office.report.view']))).status).toBe(403)
  })
  it('lists nothing from a module that is off', async () => {
    await setModule('box-office', false)
    try {
      expect((await get('/api/reports/definitions')).body.reports).toEqual([])
    }
    finally {
      await setModule('box-office', true)
    }
  })
})

describe('a report\'s question', () => {
  it('works out "all of it" as the production\'s first and last show nights, with the breakdowns its figures share', async () => {
    const seen = await get(`/api/reports/definitions/${SALES}?scope=production:${h.productionId}`)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body.period).toEqual({ rule: 'scope', from: day, to: day })
    expect(seen.body.scope).toMatchObject({ kind: 'production', id: h.productionId, title: expect.any(String) })
    expect(seen.body.breakdowns).toEqual(expect.arrayContaining(['performance', 'production', 'season', 'venue', 'day', 'month']))
    expect(seen.body.columns.map((f: { id: string, readable: boolean }) => [f.id, f.readable])).toContainEqual(['box-office.gross', true])
  })
  it('works out last month and the committee year in show nights, and refuses chosen dates that run backwards', async () => {
    expect((await get(`/api/reports/definitions/${SALES}?scope=production:${h.productionId}&period=last-month`)).body.period).toEqual({ rule: 'last-month', from: '2026-10-01', to: '2026-10-31' })
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'core.organisation.year-end', '07-31', { reason: 'test', confirm: true })
      await unit.commit()
    })
    expect((await get(`/api/reports/definitions/${SALES}?period=committee-year`)).body.period).toEqual({ rule: 'committee-year', from: '2026-08-01', to: '2027-07-31' })
    expect((await get(`/api/reports/definitions/${SALES}?period=last-committee-year`)).body.period).toEqual({ rule: 'last-committee-year', from: '2025-08-01', to: '2026-07-31' })
    expect((await get(`/api/reports/definitions/${SALES}?period=chosen&from=2026-11-30&to=2026-11-01`)).body).toMatchObject({ code: 'reports.period.chosen' })
  })
  it('refuses a report the reader cannot open', async () => {
    expect((await get(`/api/reports/definitions/${SALES}`, person(['reports.report.view']))).status).toBe(404)
  })
})

describe('reading a figure', () => {
  it('reads it live by performance, naming the performance by its show and when it starts', async () => {
    const seen = await get(`/api/reports/figures?id=box-office.capacity&from=${day}&to=${day}&scope=production:${h.productionId}&by=performance`)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body).toMatchObject({ state: 'ok', rows: [{ keys: { performance: h.performanceId }, value: 40 }] })
    expect(seen.body.labels[h.performanceId]).toEqual(expect.any(String))
    expect(seen.body.starts[h.performanceId]).toBe(Date.UTC(2026, 10, 20, 19, 30))
  })
  it('leaves out a figure the reader may not see, rather than showing nought (M3)', async () => {
    const seen = await get(`/api/reports/figures?id=box-office.capacity&from=${day}&to=${day}&scope=production:${h.productionId}`, person(['reports.report.view']))
    expect(seen.body).toEqual({ state: 'hidden' })
  })
  it('refuses a breakdown the page does not offer, and a scope that is not a kind and an id', async () => {
    expect((await get(`/api/reports/figures?id=box-office.capacity&from=${day}&to=${day}&by=box-office.channel`)).status).toBe(422)
    expect((await get(`/api/reports/figures?id=box-office.capacity&from=${day}&to=${day}&scope=${h.productionId}`)).status).toBe(422)
  })
  it('writes nothing', async () => {
    const before = await rows<{ n: number }>('SELECT count(*) AS n FROM core_audit')
    await get(`/api/reports/figures?id=box-office.gross&from=${day}&to=${day}&scope=production:${h.productionId}&by=performance`)
    expect(await rows<{ n: number }>('SELECT count(*) AS n FROM core_audit')).toEqual(before)
  })
})
