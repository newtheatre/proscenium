import { describe, expect, test } from 'bun:test'
import { announcementType, AUDIENCE_KINDS, AUDIENCE_LABELS, audienceFromQuery, composeAnnouncementForm } from '#shared/utils/announcements'
import { isTransactional, joinsDigest, messageType } from '#shared/utils/notifications'

// The ticket-holder audiences and the two types they send under (H-108 criteria 8 and 9, 0089).

describe('the composer offers ticket holders (criterion 8)', () => {
  test('both audiences are listed, by what the officer reads', () => {
    expect(AUDIENCE_KINDS).toContain('PERFORMANCE_TICKET_HOLDERS')
    expect(AUDIENCE_KINDS).toContain('SHOW_TICKET_HOLDERS')
    expect(AUDIENCE_LABELS.PERFORMANCE_TICKET_HOLDERS).toBe('Ticket holders for a performance')
    expect(AUDIENCE_LABELS.SHOW_TICKET_HOLDERS).toBe('Ticket holders for a show')
  })

  test('a performance audience needs its performance, and a show audience its show', () => {
    expect(audienceFromQuery.safeParse({ kind: 'PERFORMANCE_TICKET_HOLDERS' }).success).toBe(false)
    expect(audienceFromQuery.safeParse({ kind: 'SHOW_TICKET_HOLDERS' }).success).toBe(false)
    expect(audienceFromQuery.safeParse({ kind: 'PERFORMANCE_TICKET_HOLDERS', performanceId: 'p-1' }).data)
      .toEqual({ kind: 'PERFORMANCE_TICKET_HOLDERS', performanceId: 'p-1' })
    expect(audienceFromQuery.safeParse({ kind: 'SHOW_TICKET_HOLDERS', showId: 's-1' }).data)
      .toEqual({ kind: 'SHOW_TICKET_HOLDERS', showId: 's-1' })
  })

  test('the send form refuses a ticket-holder audience that names nothing', () => {
    const refused = composeAnnouncementForm.safeParse({
      audience: { kind: 'SHOW_TICKET_HOLDERS', showId: '' },
      subject: 'Parking',
      body: 'The car park is closed tonight.',
    })
    expect(refused.success).toBe(false)
  })
})

describe('what a ticket-holder message is sent as (criterion 9)', () => {
  test('the audience picks the type, and the safety tick picks the transactional one', () => {
    expect(announcementType({ kind: 'ALL_CURRENT_MEMBERS' }, false)).toBe('admin.announcement')
    expect(announcementType({ kind: 'ALL_CURRENT_MEMBERS' }, true)).toBe('admin.safety-notice')
    expect(announcementType({ kind: 'PERFORMANCE_TICKET_HOLDERS', performanceId: 'p-1' }, false)).toBe('admin.ticket-holders')
    expect(announcementType({ kind: 'SHOW_TICKET_HOLDERS', showId: 's-1' }, true)).toBe('admin.ticket-holders.safety-notice')
  })

  test('a plain one carries the bookings topic and joins its digest', () => {
    const type = messageType('admin.ticket-holders')
    expect(type.topic).toBe('BOOKINGS')
    expect(isTransactional(type)).toBe(false)
    expect(joinsDigest(type, false, false)).toBe(true)
  })

  test('a safety notice to ticket holders is transactional and never waits for a digest', () => {
    const type = messageType('admin.ticket-holders.safety-notice')
    expect(isTransactional(type)).toBe(true)
    expect(joinsDigest(type, false, false)).toBe(false)
  })

  test('both reach a guest\'s unverified address; the member types still do not', () => {
    expect(messageType('admin.ticket-holders').reachesUnverified).toBe(true)
    expect(messageType('admin.ticket-holders.safety-notice').reachesUnverified).toBe(true)
    expect(messageType('admin.announcement').reachesUnverified).toBeUndefined()
    expect(messageType('admin.safety-notice').reachesUnverified).toBeUndefined()
  })

  test('both keep the inbox entry beside the email (criterion 6)', () => {
    expect(messageType('admin.ticket-holders').channels).toEqual(['EMAIL', 'INBOX'])
    expect(messageType('admin.ticket-holders.safety-notice').channels).toEqual(['EMAIL', 'INBOX'])
  })
})
