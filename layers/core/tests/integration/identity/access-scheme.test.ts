// The access scheme (ID-38 to ID-44).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fact, requirements } from '#kit'
import { createUnit } from '#kit/unit'
import { deliver, env, grantDirectly, leaveIdentity, reset, setSetting, clearSetting, staff, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { setMailer, useMailer, type OutgoingEmail } from '../../../server/notifications/mailer'
import { sweepAccessScheme } from '../../../server/identity/access-scheme'

const sent: OutgoingEmail[] = []

beforeAll(async () => {
  await useIdentity()
  const inner = useMailer()
  setMailer(async (email) => {
    sent.push(email)
    return inner(email)
  })
})
afterAll(leaveIdentity)
beforeEach(() => {
  reset()
  sent.length = 0
})

const to = (addressee: string) => sent.filter(e => e.to === addressee)

/** Somebody signed in, and the needs the form offers, keyed by their slug. */
async function applicant() {
  const { browser, device, accountId } = await staff()
  const [{ address: mine }] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', accountId)
  await browser.patch('/api/core/me', { name: 'Ada Applicant' })
  const form = (await browser.get('/api/core/me/access')).body
  const need = Object.fromEntries(form.needs.map((n: any) => [n.key, n.id])) as Record<string, string>
  await deliver()
  sent.length = 0
  return { browser, device, accountId, mine: mine!, need }
}

async function reviewer() {
  const desk = await staff()
  await grantDirectly(desk.accountId, ['core.access-scheme.review'])
  return desk
}

async function companionsAnswer(accountId: string) {
  return inContext(() => requirements.check({ accounts: [accountId], refs: ['core.access-scheme:companions'], whenUnavailable: 'not-met' }), { kind: 'person', accountId, assurance: 'strong' })
}

describe('applying (ID-38)', () => {
  it('offers the eleven seeded needs, takes ticks with notes and companions, and tells the person', async () => {
    const { browser, accountId, mine, need } = await applicant()
    expect(Object.keys(need)).toEqual(expect.arrayContaining(['standing', 'level-access', 'essential-companion', 'wheelchair-transfers']))
    const sentForm = await browser.post('/api/core/me/access', { needs: [{ term: need['level-access'], note: 'Ramp at the side door, please' }, { term: need.crowds }], companions: 1 })
    expect(sentForm.status).toBe(200)
    expect(sentForm.body.status).toBe('submitted')
    await deliver()
    expect(to(mine).map(e => e.subject)).toEqual(['We have your application to the Access scheme'])
    expect(to(mine)[0]!.text).not.toMatch(/ramp|crowds|level/i)
    const mineNow = (await browser.get('/api/core/me/access')).body.application
    expect(mineNow).toMatchObject({ status: 'submitted', inForce: null, pending: { companions: 1 } })
    // Sealed: nothing readable is stored.
    const [row] = await rows<{ pending: string }>('SELECT pending FROM core_access_profiles WHERE account_id = ?', accountId)
    expect(row!.pending).not.toContain('Ramp')
    // One open application at a time.
    expect((await browser.post('/api/core/me/access', { needs: [{ term: need.standing }], companions: 0 })).body.code).toBe('core.access.open')
  })

  it('refuses a need not on the list, a long note and an empty form', async () => {
    const { browser, need } = await applicant()
    expect((await browser.post('/api/core/me/access', { needs: [{ term: 'trm_nonsense' }], companions: 0 })).body.code).toBe('core.access.unknown-need')
    expect((await browser.post('/api/core/me/access', { needs: [{ term: need.standing, note: 'x'.repeat(201) }], companions: 0 })).status).toBe(422)
    expect((await browser.post('/api/core/me/access', { needs: [], companions: 0 })).body.code).toBe('core.access.empty')
    await setSetting('core.access-scheme.allow-note', false)
    try {
      expect((await browser.post('/api/core/me/access', { needs: [{ term: need.standing, note: 'a note' }], companions: 0 })).body.code).toBe('core.access.notes-off')
    }
    finally {
      await clearSetting('core.access-scheme.allow-note')
    }
  })

  it('with the scheme off, the form answers as a missing page', async () => {
    const { browser, need } = await applicant()
    await setSetting('core.access-scheme.enabled', false)
    try {
      expect((await browser.get('/api/core/me/access')).body).toEqual({ enabled: false })
      expect((await browser.post('/api/core/me/access', { needs: [{ term: need.standing }], companions: 0 })).status).toBe(404)
    }
    finally {
      await clearSetting('core.access-scheme.enabled')
    }
  })
})

describe('reviewing (ID-40)', () => {
  it('the queue shows names and waits, never needs, to holders of core.access-scheme.read only', async () => {
    const { browser, accountId, need } = await applicant()
    await browser.post('/api/core/me/access', { needs: [{ term: need.distance, note: 'Short walks only' }], companions: 0 })
    const outsider = await staff()
    expect((await outsider.browser.get('/api/core/access-scheme')).status).toBe(403)
    const desk = await reviewer()
    const queue = (await desk.browser.get('/api/core/access-scheme')).body.applications
    const line = queue.find((a: any) => a.accountId === accountId)
    expect(line).toMatchObject({ name: 'Ada Applicant', change: false, overdue: false })
    expect(JSON.stringify(queue)).not.toContain('Short walks')
    // Opening one is recorded.
    const opened = await desk.browser.get(`/api/core/access-scheme/${accountId}`)
    expect(opened.body.application.pending.needs[0].note).toBe('Short walks only')
    expect(await rows('SELECT count(*) AS n FROM core_audit WHERE action = \'read\' AND record_id = ? AND actor_account_id = ?', accountId, desk.accountId)).toEqual([{ n: 1 }])
  })

  it('a reviewer cannot open or decide their own application', async () => {
    const desk = await reviewer()
    const form = (await desk.browser.get('/api/core/me/access')).body
    await desk.browser.post('/api/core/me/access', { needs: [{ term: form.needs[0].id }], companions: 0 })
    expect((await desk.browser.get(`/api/core/access-scheme/${desk.accountId}`)).body.code).toBe('core.access.own-record')
    expect((await desk.browser.post(`/api/core/access-scheme/${desk.accountId}/decision`, { action: 'accept' })).body.code).toBe('core.access.own-record')
  })

  it('an application waiting past reply-within is flagged in the queue and the reviewers are told once', async () => {
    const { browser, accountId, need } = await applicant()
    await browser.post('/api/core/me/access', { needs: [{ term: need.distance }], companions: 0 })
    const desk = await reviewer()
    const [{ address: desks }] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', desk.accountId)
    await deliver()
    sent.length = 0
    await env.DB.prepare('UPDATE core_access_profiles SET submitted_at = 1 WHERE account_id = ?').bind(accountId).run()
    const sweep = async () => {
      await inContext(async () => {
        const unit = createUnit()
        await sweepAccessScheme(unit)
        await unit.commit()
      })
      await deliver()
    }
    await sweep()
    await sweep()
    expect(to(desks!).map(e => e.subject)).toEqual(['Applications to the Access scheme are waiting'])
    expect(to(desks!)[0]!.text).not.toContain('Ada')
    expect((await desk.browser.get('/api/core/access-scheme')).body.applications.find((a: any) => a.accountId === accountId)).toMatchObject({ overdue: true })
    const [row] = await rows<{ flagged_at: number | null }>('SELECT flagged_at FROM core_access_profiles WHERE account_id = ?', accountId)
    expect(row!.flagged_at).not.toBeNull()
  })

  it('asking for more needs a question, and the answer returns it to the queue', async () => {
    const { browser, accountId, mine, need } = await applicant()
    await browser.post('/api/core/me/access', { needs: [{ term: need.other }], companions: 0 })
    const desk = await reviewer()
    expect((await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'ask', message: '' })).body.code).toBe('core.access.message-needed')
    await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'ask', message: 'What would help on the night?' })
    await deliver()
    expect(to(mine).at(-1)!.subject).toBe('News about your application to the Access scheme')
    expect(to(mine).at(-1)!.text).not.toContain('What would help')
    expect((await browser.get('/api/core/me/access')).body.application).toMatchObject({ status: 'more-info', message: 'What would help on the night?' })
    await browser.post('/api/core/me/access', { needs: [{ term: need.other, note: 'A seat near the aisle' }], companions: 0 })
    expect((await browser.get('/api/core/me/access')).body.application.status).toBe('submitted')
  })

  it('accepting fewer companions needs a reason; accepted puts the person on the scheme', async () => {
    const { browser, accountId, need } = await applicant()
    await browser.post('/api/core/me/access', { needs: [{ term: need['essential-companion'] }], companions: 2 })
    expect((await companionsAnswer(accountId))[0]).toMatchObject({ verdict: 'not-met' })
    const desk = await reviewer()
    expect((await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'accept', companions: 1 })).body.code).toBe('core.access.message-needed')
    expect((await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'accept', companions: 1, message: 'One companion covers what you describe.' })).status).toBe(200)
    const app = (await browser.get('/api/core/me/access')).body.application
    expect(app).toMatchObject({ status: 'accepted', companions: 1, inForce: { companions: 1 }, pending: null })
    expect((await companionsAnswer(accountId))[0]).toMatchObject({ verdict: 'met', quantity: 1 })
    // The fact is true for the person, and has no holders to list.
    const actor = { kind: 'person' as const, accountId, assurance: 'strong' as const }
    expect(await inContext(() => fact('core.access-scheme', actor), actor)).toBe(true)
  })

  it('rejecting needs a message; the person may apply again', async () => {
    const { browser, accountId, need } = await applicant()
    await browser.post('/api/core/me/access', { needs: [{ term: need.standing }], companions: 0 })
    const desk = await reviewer()
    expect((await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'reject', message: '' })).status).toBe(422)
    await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'reject', message: 'Please talk to the box office.' })
    expect((await browser.get('/api/core/me/access')).body.application.status).toBe('rejected')
    expect((await browser.post('/api/core/me/access', { needs: [{ term: need.standing }], companions: 0 })).body.status).toBe('submitted')
  })
})

describe('verifying (ID-41)', () => {
  it('only an accepted application is verified; with the setting on, companions wait for it, and a new number needs seeing again', async () => {
    await setSetting('core.access-scheme.companions-need-verified', true)
    try {
      const { browser, accountId, need } = await applicant()
      await browser.post('/api/core/me/access', { needs: [{ term: need['essential-companion'] }], companions: 1 })
      const desk = await reviewer()
      expect((await desk.browser.put(`/api/core/access-scheme/${accountId}/verified`, { method: 'access-card' })).body.code).toBe('core.access.not-accepted')
      await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'accept' })
      expect((await companionsAnswer(accountId))[0]!.verdict).toBe('not-met')
      await desk.browser.put(`/api/core/access-scheme/${accountId}/verified`, { method: 'access-card' })
      expect((await companionsAnswer(accountId))[0]).toMatchObject({ verdict: 'met', quantity: 1 })
      // A change waits for review; what was accepted, and verified, stays in force.
      await browser.post('/api/core/me/access', { needs: [{ term: need['essential-companion'] }], companions: 2 })
      expect((await browser.get('/api/core/me/access')).body.application).toMatchObject({ status: 'accepted', companions: 1, pending: { companions: 2 } })
      await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'accept' })
      expect((await browser.get('/api/core/me/access')).body.application).toMatchObject({ verified: false, companions: 0 })
      // No card number or picture is kept: only what kind of evidence, sealed.
      const [row] = await rows<{ verified_method: string | null }>('SELECT verified_method FROM core_access_profiles WHERE account_id = ?', accountId)
      expect(row!.verified_method).toBeNull()
    }
    finally {
      await clearSetting('core.access-scheme.companions-need-verified')
    }
  })
})

describe('reading for a purpose (ID-39)', () => {
  it('answers only an accepted application, a purpose switched on and a reader with its ability, and records each read', async () => {
    const { browser, accountId, need } = await applicant()
    // The welfare purpose is a members' one: it is offered only with a standing.
    expect((await browser.get('/api/core/me/access')).body.sharing.map((p: any) => p.id)).not.toContain('core.welfare')
    await grantDirectly(accountId, ['core.account.search'])
    await browser.post('/api/core/me/access', { needs: [{ term: need.crowds, note: 'Quiet corner' }, { term: need.standing }], companions: 0 })
    const welfare = await staff()
    const read = () => welfare.browser.get(`/api/core/accounts/${accountId}/access-needs?purpose=core.welfare`)
    expect((await read()).status).toBe(403)
    await grantDirectly(welfare.accountId, ['core.access-profile.read'])
    // Waiting, not shared: the same empty answer either way.
    expect((await read()).body).toEqual({ shared: false })
    expect((await browser.get('/api/core/me/access')).body.sharing).toEqual([expect.objectContaining({ id: 'core.welfare', on: false })])
    await browser.put('/api/core/me/access/sharing', { purpose: 'core.welfare', on: true })
    expect((await read()).body).toEqual({ shared: false })
    const desk = await reviewer()
    await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'accept' })
    const answer = (await read()).body
    expect(answer.shared).toBe(true)
    expect(answer.needs).toEqual(expect.arrayContaining([{ key: 'crowds', label: 'Difficulty with crowds', note: 'Quiet corner' }, { key: 'standing', label: 'Difficulty standing or queueing' }]))
    // The person sees the read, with the purpose.
    const reads = (await browser.get('/api/core/me/access')).body.reads
    expect(reads.some((r: any) => r.purpose === 'core.welfare')).toBe(true)
    // Switching off stops reads at once.
    await browser.put('/api/core/me/access/sharing', { purpose: 'core.welfare', on: false })
    expect((await read()).body).toEqual({ shared: false })
  })
})

describe('changing, confirming and leaving (ID-42, ID-44)', () => {
  it('staff apply on somebody\'s behalf, marked as made by staff, and the person is told', async () => {
    const { browser, accountId, mine, need } = await applicant()
    const desk = await reviewer()
    expect((await desk.browser.post(`/api/core/access-scheme/${accountId}/application`, { needs: [{ term: need.distance }], companions: 0 })).status).toBe(200)
    await deliver()
    expect(to(mine).map(e => e.subject)).toEqual(['We have your application to the Access scheme'])
    expect((await browser.get('/api/core/me/access')).body.application.submittedVia).toBe('staff')
    // Once another reviewer exists, the one who entered it does not decide it.
    const second = await reviewer()
    expect((await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'accept' })).body.code).toBe('core.access.entered-by-you')
    expect((await second.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'accept' })).status).toBe(200)
  })

  it('leaving deletes the application and the sharing choices', async () => {
    const { browser, accountId, need } = await applicant()
    await grantDirectly(accountId, ['core.account.search'])
    await browser.post('/api/core/me/access', { needs: [{ term: need.distance }], companions: 0 })
    await browser.put('/api/core/me/access/sharing', { purpose: 'core.welfare', on: true })
    expect((await browser.delete('/api/core/me/access')).status).toBe(200)
    expect(await rows('SELECT count(*) AS n FROM core_access_profiles WHERE account_id = ?', accountId)).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM core_access_shares WHERE account_id = ?', accountId)).toEqual([{ n: 0 }])
  })

  it('past the review date the person is asked twice, then the application goes to the queue and stays in force', async () => {
    const { browser, accountId, mine, need } = await applicant()
    await browser.post('/api/core/me/access', { needs: [{ term: need.distance }], companions: 1 })
    const desk = await reviewer()
    await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'accept' })
    await deliver()
    sent.length = 0
    const sweep = async () => {
      await env.DB.prepare('UPDATE core_access_profiles SET review_due = 1 WHERE account_id = ?').bind(accountId).run()
      await inContext(async () => {
        const unit = createUnit()
        await sweepAccessScheme(unit)
        await unit.commit()
      })
      await deliver()
    }
    await sweep()
    await sweep()
    expect(to(mine).map(e => e.subject)).toEqual(['Are your details for the Access scheme still right?', 'Are your details for the Access scheme still right?'])
    await sweep()
    expect((await desk.browser.get('/api/core/access-scheme')).body.applications.find((a: any) => a.accountId === accountId)).toMatchObject({ change: true })
    expect((await companionsAnswer(accountId))[0]).toMatchObject({ verdict: 'met', quantity: 1 })
    // Confirming resets the date.
    await env.DB.prepare('UPDATE core_access_profiles SET pending = NULL WHERE account_id = ?').bind(accountId).run()
    expect((await browser.post('/api/core/me/access/confirm')).status).toBe(200)
    const [row] = await rows<{ review_due: number, reminders: number }>('SELECT review_due, reminders FROM core_access_profiles WHERE account_id = ?', accountId)
    expect(row!.reminders).toBe(0)
    expect(row!.review_due).toBeGreaterThan(Date.now() + 364 * 86400_000)
  })

  it('a rejected application is deleted after keep-rejected', async () => {
    const { browser, accountId, need } = await applicant()
    await browser.post('/api/core/me/access', { needs: [{ term: need.distance }], companions: 0 })
    const desk = await reviewer()
    await desk.browser.post(`/api/core/access-scheme/${accountId}/decision`, { action: 'reject', message: 'Not this time.' })
    await env.DB.prepare('UPDATE core_access_profiles SET decided_at = 1 WHERE account_id = ?').bind(accountId).run()
    await inContext(async () => {
      const unit = createUnit()
      await sweepAccessScheme(unit)
      await unit.commit()
    })
    expect(await rows('SELECT count(*) AS n FROM core_access_profiles WHERE account_id = ?', accountId)).toEqual([{ n: 0 }])
  })
})
