import { describe, expect, test } from 'bun:test'
import { audienceFromQuery, saysAnnouncementSent, saysAudienceCount } from '#shared/utils/announcements'
import { ROOM_OVERRIDE_FLOORS, saysOverrideFloor } from '#shared/utils/rooms'
import { committeeYearToDate } from '#shared/utils/utilisation'

// The pure logic behind the comms, admin and rooms fixes (item 10): the count line, the sent
// line, what a room override accepts, and the span a utilisation review is written about.

describe('the count comes before the draft (H-108 criterion 7)', () => {
  test('an audience with people in it says how many will get it', () => {
    expect(saysAudienceCount(42)).toBe('42 people will get this')
  })

  test('one person reads as one person', () => {
    expect(saysAudienceCount(1)).toBe('1 person will get this')
  })

  test('an empty audience says so rather than reading as nought people', () => {
    expect(saysAudienceCount(0)).toBe('Nobody is in this audience')
  })
})

describe('what the composer says after a send (H-108 criterion 7)', () => {
  test('a send that went says it went, and to how many', () => {
    expect(saysAnnouncementSent(42, 0)).toBe('Sent to 42 recipients')
  })

  test('a send held for the digest says that instead of saying sent', () => {
    const said = saysAnnouncementSent(42, 42)
    expect(said).toBe('Queued for 42 recipients')
    expect(said).not.toContain('Sent')
  })

  test('one held recipient is enough to say queued, because the send log has nothing to show', () => {
    expect(saysAnnouncementSent(42, 1)).toBe('Queued for 42 recipients')
  })
})

describe('an audience can be counted from a link (H-108 criterion 7)', () => {
  test('a kind that needs nothing else is enough', () => {
    expect(audienceFromQuery.safeParse({ kind: 'ALL_CURRENT_MEMBERS' })).toMatchObject({ success: true })
  })

  test('a role audience without a role is refused rather than counted as everybody', () => {
    expect(audienceFromQuery.safeParse({ kind: 'ROLE_HOLDERS' }).success).toBe(false)
  })

  test('a role audience with its role parses to the definition the resolver takes', () => {
    const parsed = audienceFromQuery.safeParse({ kind: 'ROLE_HOLDERS', role: 'TREASURER' })
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ kind: 'ROLE_HOLDERS', role: 'TREASURER' })
  })

  test('a session audience without a session is refused', () => {
    expect(audienceFromQuery.safeParse({ kind: 'SESSION_SIGNUPS' }).success).toBe(false)
  })

  test('an audience kind nobody declared is refused', () => {
    expect(audienceFromQuery.safeParse({ kind: 'EVERYBODY_EVER' }).success).toBe(false)
  })
})

describe('one truth about what a room override takes (C-106 criterion 7)', () => {
  test('notice is the one rule where nought is a real answer', () => {
    expect(ROOM_OVERRIDE_FLOORS.noticeHours).toBe(0)
  })

  test('every other rule wants at least one', () => {
    expect(ROOM_OVERRIDE_FLOORS.minBookingMinutes).toBe(1)
    expect(ROOM_OVERRIDE_FLOORS.maxBookingHours).toBe(1)
    expect(ROOM_OVERRIDE_FLOORS.horizonWeeks).toBe(1)
    expect(ROOM_OVERRIDE_FLOORS.activeBookingsCap).toBe(1)
  })

  test('the words beside a field say what the field accepts', () => {
    expect(saysOverrideFloor('noticeHours')).toBe('Nought is a real answer, meaning none needed')
    expect(saysOverrideFloor('minBookingMinutes')).toBe('One or more')
  })
})

describe('a utilisation review is written about the committee year (C-117 criterion 6)', () => {
  test('in September the span opens on the first of August just gone', () => {
    expect(committeeYearToDate(new Date('2026-09-21T09:00:00Z')))
      .toEqual({ from: '2026-08-01', to: '2026-09-21' })
  })

  test('on 31 July the span still belongs to the year that is ending', () => {
    expect(committeeYearToDate(new Date('2026-07-31T12:00:00Z')))
      .toEqual({ from: '2025-08-01', to: '2026-07-31' })
  })

  test('the last minute of 31 July, London, is still the old year', () => {
    expect(committeeYearToDate(new Date('2026-07-31T22:59:00Z')).from).toBe('2025-08-01')
  })

  test('the first minute of 1 August, London, has turned over', () => {
    expect(committeeYearToDate(new Date('2026-07-31T23:30:00Z')))
      .toEqual({ from: '2026-08-01', to: '2026-08-01' })
  })

  test('a January instant reads as London, not as the runtime\'s own day', () => {
    expect(committeeYearToDate(new Date('2027-01-15T00:30:00Z')))
      .toEqual({ from: '2026-08-01', to: '2027-01-15' })
  })
})
