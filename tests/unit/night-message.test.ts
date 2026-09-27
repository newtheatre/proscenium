import { describe, expect, test } from 'bun:test'
import { sendTimingOptions, sendsNowByDefault } from '#shared/utils/announcements'
import { NIGHT_AUDIENCES, NIGHT_AUDIENCE_LABELS, nightMessageForm, nightMessageType } from '#shared/utils/night-message'
import { showNightBounds } from '#shared/utils/show-night'

// Issue 1327, decision 0101: tonight's duty manager messages tonight's audience from the show-night
// shell, at once, and the announce composer says when a message goes before it goes.

const read = (path: string): Promise<string> => Bun.file(path).text()

describe('tonight\'s audience is one performance\'s ticket holders or its rota (0101)', () => {
  test('two audiences, in the words the screen uses', () => {
    expect([...NIGHT_AUDIENCES]).toEqual(['TICKET_HOLDERS', 'ROTA'])
    expect(NIGHT_AUDIENCE_LABELS).toEqual({ TICKET_HOLDERS: 'Ticket holders', ROTA: 'Tonight\'s rota' })
  })

  test('every message sends at once: tonight\'s news is no use in the next digest', () => {
    expect(nightMessageType('TICKET_HOLDERS')).toBe('admin.ticket-holders.safety-notice')
    expect(nightMessageType('ROTA')).toBe('admin.safety-notice')
  })

  test('the form names a performance, an audience, a subject and a message', () => {
    const good = { performanceId: 'p-1', audience: 'TICKET_HOLDERS', subject: 'Doors at 19:15', body: 'A late get-in.' }
    expect(nightMessageForm.safeParse(good).success).toBe(true)
    expect(nightMessageForm.safeParse({ ...good, performanceId: '' }).success).toBe(false)
    expect(nightMessageForm.safeParse({ ...good, audience: 'ALL_CURRENT_MEMBERS' }).success).toBe(false)
    expect(nightMessageForm.safeParse({ ...good, subject: ' ' }).success).toBe(false)
    expect(nightMessageForm.safeParse({ ...good, body: 'x'.repeat(10_001) }).success).toBe(false)
  })
})

describe('the announce composer says when a message goes (issue 1327)', () => {
  test('to ticket holders: now, or with their booking messages inside the digest window', () => {
    expect(sendTimingOptions(true, 60)).toEqual([
      { value: 'NOW', label: 'Send now to everyone holding a ticket', description: 'Reaches every ticket holder at once, whatever their bookings preference.' },
      { value: 'WITH_DIGEST', label: 'Send with their booking messages, within 60 minutes', description: 'Honours each ticket holder\'s bookings preference.' },
    ])
  })

  test('to members: now, or with their committee announcements', () => {
    expect(sendTimingOptions(false, 45).map(option => option.label)).toEqual([
      'Send now to everyone in this audience',
      'Send with their committee announcements, within 45 minutes',
    ])
  })

  test('a message about tonight\'s performance goes now unless the officer says otherwise', () => {
    const night = '2026-10-17'
    const curtain = Math.floor(showNightBounds(night).from.getTime() / 1000) + 15.5 * 3600
    const during = new Date((curtain - 3600) * 1000)
    expect(sendsNowByDefault(curtain, during)).toBe(true)
    expect(sendsNowByDefault(curtain + 86_400, during)).toBe(false)
    expect(sendsNowByDefault(null, during)).toBe(false)
  })

  test('the composer offers the choice in those words, where the tick box was', async () => {
    const source = await read('app/pages/comms/announce.vue')
    expect(source).toContain('sendTimingOptions(')
    expect(source).toContain('sendsNowByDefault(')
    expect(source).not.toContain('This is a safety notice')
  })
})

describe('the show-night composer (issue 1327, E-112)', () => {
  test('posts to tonight\'s own routes, never the console\'s', async () => {
    const source = await read('app/pages/tonight/message.vue')
    expect(source).toContain('\'/api/tonight/message\'')
    expect(source).toContain('\'/api/tonight/message/preview\'')
    expect(source).not.toContain('/api/admin/comms')
  })

  test('every route checks tonight\'s duty manager authority itself (E-111 criterion 5)', async () => {
    for (const path of ['server/api/tonight/message/index.post.ts', 'server/api/tonight/message/preview.post.ts', 'server/api/tonight/message/audience.get.ts']) {
      expect(`${path}: ${(await read(path)).includes('requireNightAuthority(event, \'DUTY_MANAGER\'')}`).toBe(`${path}: true`)
    }
  })
})
