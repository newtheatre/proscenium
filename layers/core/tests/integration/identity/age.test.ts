// Under 18 (C-74, ruling R3-25): only the day someone turns 18, told by them or recorded by staff
// after seeing ID, read by modules as 'under-18' or 'unknown', and forgotten once it comes.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Browser, env, grantDirectly, leaveIdentity, reset, setSetting, signInByEmail, staff, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { setClock, createUnit } from '#kit'
import { ageStatus, ageStatuses, sweepAgeMarkers } from '../../../server/identity/age'
import { eraseAccount } from '../../../server/identity/erasure'

beforeAll(useIdentity)
afterAll(() => {
  setClock(undefined)
  leaveIdentity()
})
beforeEach(async () => {
  reset()
  setClock('2026-11-24T12:00:00Z')
  await setSetting('core.locale.time-zone', 'Europe/London')
  await env.DB.prepare('DELETE FROM core_age_markers').run()
})

async function signedIn() {
  const browser = new Browser()
  return { browser, accountId: await signInByEmail(browser) }
}

describe('a person tells the theatre they are under 18', () => {
  it('records only the day they turn 18, and modules read under-18 until then', async () => {
    const { browser, accountId } = await signedIn()
    expect((await browser.put('/api/core/me/age', { turns18On: '2027-03-01' })).status).toBe(200)
    expect(await rows('SELECT turns_18_on, source FROM core_age_markers WHERE account_id = ?', accountId)).toEqual([{ turns_18_on: '2027-03-01', source: 'self' }])
    expect((await browser.get('/api/core/me/age')).body.marker).toEqual({ turns18On: '2027-03-01', source: 'self' })
    expect(await inContext(() => ageStatus(accountId))).toBe('under-18')
    expect(await inContext(() => ageStatus(accountId, '2027-03-01'))).toBe('unknown')
    // The audit says it changed, never the date.
    const [audit] = await rows<{ detail: string }>('SELECT detail FROM core_audit WHERE action = \'update\' AND record_id = ? ORDER BY at DESC LIMIT 1', accountId)
    expect(audit?.detail).not.toContain('2027')
  })

  it('refuses a day already passed or too far off, and can be taken back', async () => {
    const { browser, accountId } = await signedIn()
    expect((await browser.put('/api/core/me/age', { turns18On: '2026-11-24' })).body.code).toBe('core.age.not-under-18')
    expect((await browser.put('/api/core/me/age', { turns18On: '2031-01-01' })).body.code).toBe('core.age.too-far')
    expect((await browser.put('/api/core/me/age', { turns18On: 'soon' })).body.code).toBe('core.age.bad-date')
    await browser.put('/api/core/me/age', { turns18On: '2027-03-01' })
    expect((await browser.put('/api/core/me/age', { turns18On: null })).status).toBe(200)
    expect(await inContext(() => ageStatus(accountId))).toBe('unknown')
  })

  it('unknown is the answer for anyone who said nothing, never adult', async () => {
    const { accountId } = await signedIn()
    expect(await inContext(() => ageStatus(accountId))).toBe('unknown')
  })
})

describe('staff record it after seeing ID', () => {
  it('needs core.age.record, and then the person cannot change it themselves', async () => {
    const desk = await staff()
    const { browser, accountId } = await signedIn()
    expect((await desk.browser.put(`/api/core/accounts/${accountId}/age`, { turns18On: '2027-06-30' })).status).toBe(403)
    await grantDirectly(desk.accountId, ['core.age.record'])
    expect((await desk.browser.put(`/api/core/accounts/${accountId}/age`, { turns18On: '2027-06-30' })).status).toBe(200)
    expect((await desk.browser.get(`/api/core/accounts/${accountId}`)).body).toMatchObject({ age: { turns18On: '2027-06-30', source: 'staff' }, actions: { age: true } })
    expect((await browser.put('/api/core/me/age', { turns18On: null })).body.code).toBe('core.age.recorded-by-staff')
    expect(await inContext(() => ageStatus(accountId))).toBe('under-18')
  })

  it('is not shown on the person\'s page to staff without the ability', async () => {
    const desk = await staff()
    await grantDirectly(desk.accountId, ['core.account.read'])
    const { browser, accountId } = await signedIn()
    await browser.put('/api/core/me/age', { turns18On: '2027-03-01' })
    const page = (await desk.browser.get(`/api/core/accounts/${accountId}`)).body
    expect(page.age).toBeUndefined()
    expect(page.actions.age).toBe(false)
  })
})

describe('reading many at once, forgetting and erasing', () => {
  it('answers each id asked, through merges', async () => {
    const one = await signedIn()
    const two = await signedIn()
    await one.browser.put('/api/core/me/age', { turns18On: '2027-03-01' })
    const statuses = await inContext(() => ageStatuses([one.accountId, two.accountId]))
    expect(Object.fromEntries(statuses)).toEqual({ [one.accountId]: 'under-18', [two.accountId]: 'unknown' })
  })

  it('deletes the day once it comes, so nothing stays on an adult', async () => {
    const { browser, accountId } = await signedIn()
    await browser.put('/api/core/me/age', { turns18On: '2027-03-01' })
    setClock('2027-03-01T09:00:00Z')
    await inContext(async () => {
      const unit = createUnit()
      await sweepAgeMarkers(unit)
      await unit.commit()
    })
    expect(await rows('SELECT 1 FROM core_age_markers WHERE account_id = ?', accountId)).toEqual([])
  })

  it('erasure deletes it', async () => {
    const { browser, accountId } = await signedIn()
    await browser.put('/api/core/me/age', { turns18On: '2027-03-01' })
    await inContext(async () => {
      await eraseAccount(accountId)
    })
    expect(await rows('SELECT 1 FROM core_age_markers WHERE account_id = ?', accountId)).toEqual([])
  })
})
