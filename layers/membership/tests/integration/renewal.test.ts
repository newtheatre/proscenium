// Renewal and reminders (R1 to R9): renewing in the window follows on the day after the end;
// renewing after the end, until grace runs out, starts today; once only; and the daily task sends
// each reminder once, to nobody who has renewed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { inContext, rows } from '../../../../tests/integration/helpers'
import sendReminders from '../../server/tasks/send-reminders'
import { NOV_17, applicant, ready, req, scheme } from './stage'

beforeAll(async () => {
  await ready()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.site.origin', 'https://theatre.example', { reason: 'test', confirm: true })
    await unit.commit()
  })
})
afterAll(() => setClock(NOV_17))

const at = (date: string) => Date.parse(`${date}T12:00:00Z`)
const runReminders = () => inContext(async () => {
  const unit = createUnit()
  await sendReminders(unit.view(), { dueAt: Date.now() })
  await unit.commit()
}, { kind: 'job' } as never)
const sent = async (membershipId: string) => (await rows<{ type_key: string }>('SELECT type_key FROM core_notifications WHERE subject_id = ? ORDER BY created_at, id', membershipId)).map(r => r.type_key)

async function member(name: string, fields: Record<string, unknown> = {}) {
  setClock(NOV_17)
  const id = await scheme({ renewalOpensDays: 30, graceDays: 10, ...fields })
  await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  const who = await applicant(name)
  const m = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body
  expect(m.endsOn).toBe('2027-11-16')
  return { schemeId: id, who, id: m.membershipId as string }
}

describe('renewal', () => {
  it('opens 30 days before the end, follows on the day after, and happens once', async () => {
    const { who, id } = await member('Renew Early')
    setClock(at('2027-10-16'))
    expect((await req('POST', `/api/membership/mine/${id}/renew`, {}, who)).body.code).toBe('membership.renew.not-yet')
    setClock(at('2027-10-17'))
    const mine = (await req('GET', '/api/membership/mine', undefined, who)).body
    expect(mine.memberships.find((m: { id: string }) => m.id === id).renewal).toEqual({ opensOn: '2027-10-17', closesOn: '2027-11-26', open: true })
    const renewed = await req('POST', `/api/membership/mine/${id}/renew`, {}, who)
    expect(renewed.body, JSON.stringify(renewed.body)).toMatchObject({ startsOn: '2027-11-17', endsOn: '2028-11-16', renewed: true, pending: false })
    expect((await req('POST', `/api/membership/mine/${id}/renew`, {}, who)).body.membershipId).toBe(renewed.body.membershipId)
    const [row] = await rows<{ origin: string, renews_id: string }>('SELECT origin, renews_id FROM membership_memberships WHERE id = ?', renewed.body.membershipId)
    expect(row).toEqual({ origin: 'renewed', renews_id: id })
  })

  it('starts today when renewed in grace, and is refused once grace is over', async () => {
    const late = await member('Renew Late')
    setClock(at('2027-11-20'))
    expect((await req('POST', `/api/membership/mine/${late.id}/renew`, {}, late.who)).body).toMatchObject({ startsOn: '2027-11-20', endsOn: '2028-11-19' })
    const lapsed = await member('Too Late')
    setClock(at('2027-11-27'))
    expect((await req('POST', `/api/membership/mine/${lapsed.id}/renew`, {}, lapsed.who)).body.code).toBe('membership.renew.too-late')
  })
})

describe("renewal on My account's overview", () => {
  const notices = async (who: Parameters<typeof req>[3]) => ((await req('GET', '/api/core/account-notices', undefined, who)).body.notices as { key: string, title: string, params?: { scheme?: string } }[])
    .filter(n => n.key.startsWith('membership.'))

  it('says a renewal is open from the day it opens until it is done', async () => {
    const { who, id } = await member('Notice Me')
    setClock(at('2027-10-16'))
    expect(await notices(who)).toEqual([])
    setClock(at('2027-10-17'))
    const [open] = await notices(who)
    expect(open).toMatchObject({ key: `membership.renewal-open:${id}`, title: 'membership.notices.renewal-open.title' })
    expect(open?.params?.scheme).toMatch(/^Scheme \d+$/)
    await req('POST', `/api/membership/mine/${id}/renew`, {}, who)
    expect(await notices(who)).toEqual([])
  })
})

describe('reminders', () => {
  it('sends renewal open, the last reminder and lapsed once each, and nothing after renewing', async () => {
    const { id } = await member('Reminded')
    const renewer = await member('Renewer')
    setClock(at('2027-10-17'))
    await runReminders()
    await runReminders()
    expect(await sent(id)).toEqual(['membership.renewal-open'])
    expect(await sent(renewer.id)).toEqual(['membership.renewal-open'])
    await req('POST', `/api/membership/mine/${renewer.id}/renew`, {}, renewer.who)
    setClock(at('2027-11-10'))
    await runReminders()
    expect(await sent(id)).toEqual(['membership.renewal-open', 'membership.renewal-final'])
    expect(await sent(renewer.id)).toEqual(['membership.renewal-open'])
    setClock(at('2027-11-27'))
    await runReminders()
    await runReminders()
    expect(await sent(id)).toEqual(['membership.renewal-open', 'membership.renewal-final', 'membership.lapsed'])
    setClock(at('2027-12-30'))
    await runReminders()
    expect(await sent(id)).toHaveLength(3)
  })
})
