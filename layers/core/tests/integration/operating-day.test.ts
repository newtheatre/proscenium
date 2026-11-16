// C-37: changing the time zone or the day start says first how many operating days would move, then
// recalculates every one not yet completed, in a job.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit } from '#kit'
import { runJob } from '#kit/jobs'
import { resetRateLimits } from '#kit/ratelimit'
import dayChange from '../../server/api/core/organisation/day-change.get'
import { call, env, inContext, person, rows, sent, server } from '../../../../tests/integration/helpers'

const handle = server({ 'GET /api/core/organisation/day-change': dayChange })
const admin = () => person(['core.organisation.edit'])

async function deliver(): Promise<string[]> {
  const outcomes: string[] = []
  while (sent.length) {
    const message = sent.shift()!
    outcomes.push(await inContext(() => runJob(message.jobId), { kind: 'job' }))
  }
  return outcomes
}

async function show(id: string, startsAt: string, day: string, completed = false) {
  await env.DB.prepare('INSERT INTO seats_performances (id, title, capacity, sold, starts_at, operating_day, completed_at) VALUES (?, ?, 10, 0, ?, ?, ?)')
    .bind(id, 'Hamlet', Date.parse(startsAt), day, completed ? Date.parse(startsAt) : null).run()
}

beforeEach(async () => {
  sent.length = 0
  resetRateLimits()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { confirm: true })
    await unit.commit()
  })
  sent.length = 0
  // 00:30 in London on 15 November: the 14th's operating day with a 04:00 rollover.
  await show('sp_midnight', '2026-11-15T00:30:00Z', '2026-11-14')
  await show('sp_evening', '2026-11-14T19:30:00Z', '2026-11-14')
  await show('sp_done', '2026-11-01T00:30:00Z', '2026-10-31', true)
})
afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM seats_performances WHERE id LIKE 'sp\\_%' ESCAPE '\\' AND starts_at IS NOT NULL"),
    env.DB.prepare("DELETE FROM core_settings WHERE key IN ('core.locale.day-start', 'core.locale.time-zone')"),
    env.DB.prepare('DELETE FROM core_jobs'),
  ])
})

describe('the time zone and the rollover (C-37)', () => {
  it('says how many operating days a change would move, before anything changes', async () => {
    const response = await call(handle, 'GET', '/api/core/organisation/day-change?dayStart=00:00', { actor: admin() })
    expect(await response.json()).toEqual({ changes: 1 })
    const far = await call(handle, 'GET', '/api/core/organisation/day-change?timeZone=Pacific/Auckland', { actor: admin() })
    expect(await far.json()).toEqual({ changes: 2 })
    expect((await call(handle, 'GET', '/api/core/organisation/day-change?timeZone=Mars/Olympus', { actor: admin() })).status).toBe(422)
    expect((await call(handle, 'GET', '/api/core/organisation/day-change?dayStart=00:00', { actor: person([]) })).status).toBe(403)
  })

  it('recalculates every performance not yet completed after the day start changes', async () => {
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit, 'core.locale.day-start', '00:00', { confirm: true })
      await unit.commit()
    })
    await deliver()
    expect(await rows('SELECT id, operating_day FROM seats_performances WHERE starts_at IS NOT NULL ORDER BY id')).toEqual([
      { id: 'sp_done', operating_day: '2026-10-31' },
      { id: 'sp_evening', operating_day: '2026-11-14' },
      { id: 'sp_midnight', operating_day: '2026-11-15' },
    ])
  })

  it('refuses a day start later than 08:00', async () => {
    await expect(inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit, 'core.locale.day-start', '09:00', { confirm: true })
    })).rejects.toMatchObject({ code: 'core.setting.invalid' })
  })
})
