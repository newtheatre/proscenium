import { describe, expect, test } from 'bun:test'
import { defaultSendTiming, sendTimingOptions } from '#shared/utils/announcements'
import { NIGHT_AUDIENCES, NIGHT_AUDIENCE_LABELS, nightMessageClaim, nightMessageForm, nightMessageType, saysNightMessageSent } from '#shared/utils/night-message'
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

  test('the form names a performance, an audience, a subject, a message and the draft it sends', () => {
    const good = { performanceId: 'p-1', audience: 'TICKET_HOLDERS', subject: 'Doors at 19:15', body: 'A late get-in.', draftKey: '0b6c1f4e-6f1a-4f0e-9d5e-2f8a7c3b1d90' }
    expect(nightMessageForm.safeParse(good).success).toBe(true)
    expect(nightMessageForm.safeParse({ ...good, draftKey: undefined }).success).toBe(false)
    expect(nightMessageForm.safeParse({ ...good, draftKey: 'not-a-key' }).success).toBe(false)
    expect(nightMessageForm.safeParse({ ...good, performanceId: '' }).success).toBe(false)
    expect(nightMessageForm.safeParse({ ...good, audience: 'ALL_CURRENT_MEMBERS' }).success).toBe(false)
    expect(nightMessageForm.safeParse({ ...good, subject: ' ' }).success).toBe(false)
    expect(nightMessageForm.safeParse({ ...good, body: 'x'.repeat(10_001) }).success).toBe(false)
  })
})

// A draft is sent once to each person, however often the button is pressed after a dropped
// connection: each recipient's copy is claimed under the draft's own key (0048).
describe('tonight\'s message reaches each person once per draft (0101, 0048)', () => {
  test('the claim names the draft and the person', () => {
    expect(nightMessageClaim('draft-1', 'user-1')).toBe('night-message:draft-1:user-1')
  })

  test('a second press says who it reached, and that everyone else already had it', () => {
    expect(saysNightMessageSent(3)).toBe('Sent to 3 people')
    expect(saysNightMessageSent(1)).toBe('Sent to 1 person')
    expect(saysNightMessageSent(0)).toBe('Everyone in this audience already has it')
  })

  test('the page sends its draft key, and a changed draft is a new one', async () => {
    const source = await read('app/pages/tonight/message.vue')
    expect(source).toContain('draftKey: draftKey.value')
    expect(source.match(/draftKey\.value = crypto\.randomUUID\(\)/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).not.toContain('Look in the send log')
  })

  // The end-to-end pin runs nightly, so the claim-then-send order is also held here on every push.
  test('the send claims each copy first, sends under that claim, and counts only those it reached', async () => {
    const source = await read('server/utils/night-message.ts')
    expect(source).toMatch(/if \(!await claimNotification\(\{[^}]*key: claim[^}]*\}\)\) continue/)
    expect(source).toContain('notify(event, { type, userId, claim,')
    expect(source).toContain('recipientCount: reached')
    expect(source).toContain('return { count: reached }')
  })

  test('a press that fails part-way still audits the copies it sent', async () => {
    const source = await read('server/utils/night-message.ts')
    expect(source).toMatch(/\}\s*finally \{\s*await db\.insert\(schema\.auditLog\)\.values\(auditEntry\(\{/)
    expect(source).not.toContain('sendOnce(')
  })
})

describe('the announce composer says when a message goes (issue 1327)', () => {
  test('to ticket holders: now, or with their booking messages in the next digest', () => {
    expect(sendTimingOptions(true, 60)).toEqual([
      { value: 'NOW', label: 'Send now to everyone holding a ticket', description: 'Reaches every ticket holder at once, whatever their bookings preference.' },
      { value: 'WITH_DIGEST', label: 'Send with their booking messages, in the next digest, about 60 minutes from now', description: 'Honours each ticket holder\'s bookings preference.' },
    ])
  })

  test('to members: now, or with their committee announcements', () => {
    expect(sendTimingOptions(false, 45).map(option => option.label)).toEqual([
      'Send now to everyone in this audience',
      'Send with their committee announcements, in the next digest, about 45 minutes from now',
    ])
  })

  // Send now is a preference-ignoring type, so it is never left standing for an audience it was
  // not chosen for: the timing follows the selection, both ways.
  test('the timing starts on now for tonight\'s performance and on the digest for anything else', () => {
    const night = '2026-10-17'
    const curtain = Math.floor(showNightBounds(night).from.getTime() / 1000) + 15.5 * 3600
    const during = new Date((curtain - 3600) * 1000)
    expect(defaultSendTiming(curtain, during)).toBe('NOW')
    expect(defaultSendTiming(curtain + 86_400, during)).toBe('WITH_DIGEST')
    expect(defaultSendTiming(null, during)).toBe('WITH_DIGEST')
  })

  // Every source by name, not the `audience` computed: a change of kind clears the performance
  // after that computed's watcher has run, and the audience then no longer reads it.
  test('the composer resets the timing on every change of audience, and on starting again', async () => {
    const source = await read('app/pages/comms/announce.vue')
    expect(source).toMatch(/watch\(\[kind, role, sessionId, showId, performanceId\], \(\) => \{\s*timing\.value = defaultTiming\(\)/)
    expect(source).not.toContain('watch(performanceId, () => {')
    expect(source.match(/timing\.value = defaultTiming\(\)/g)?.length).toBe(2)
    expect(source).toContain('defaultSendTiming(')
    expect(source).not.toContain('timing.value = \'NOW\'')
    expect(source).not.toContain('timing.value = \'WITH_DIGEST\'')
  })

  test('before the window is known the choice still stands, naming the digest instead', () => {
    expect(sendTimingOptions(true, null)[1]!.label).toBe('Send with their booking messages, in the next digest')
  })

  test('the composer offers the choice in those words, where the tick box was', async () => {
    const source = await read('app/pages/comms/announce.vue')
    expect(source).toContain('sendTimingOptions(')
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
