import { describe, expect, test } from 'bun:test'
import { isAuditAction } from '#shared/utils/audit-actions'
import {
  DOOR_COVER_ACTION,
  doorCoverEntry,
  doorCoverTarget,
  nightAuthorityRefusal,
  saysDoorCover,
} from '#shared/utils/night-authority'

// Tonight's confirmed duty manager covers the door for their own performance, recorded once as
// cover on the night report (0095, amending 0044; E-111 criterion 1 as amended, issue 1306).

const NIGHT = '2026-10-17'
const VENUE = 'venue-a'

describe('cover is recorded once per duty manager, night and venue (0095)', () => {
  test('the target carries the night and the venue, and never the role a bypass keys on', () => {
    expect(doorCoverTarget(NIGHT, VENUE)).toBe(`door-cover:${NIGHT}:${VENUE}`)
    expect(doorCoverTarget(NIGHT, 'venue-b')).not.toBe(doorCoverTarget(NIGHT, VENUE))
  })

  test('the entry names the duty manager as its actor and holds identifiers only', () => {
    const entry = doorCoverEntry('rowan', NIGHT, VENUE, ['matinee', 'evening'])
    expect(entry).toMatchObject({ actorId: 'rowan', action: DOOR_COVER_ACTION, target: doorCoverTarget(NIGHT, VENUE) })
    expect(entry.detail).toEqual({ night: NIGHT, venueId: VENUE, performanceIds: ['matinee', 'evening'] })
  })

  test('the action is registered, so the audit trail can name it', () => {
    expect(isAuditAction(DOOR_COVER_ACTION)).toBe(true)
  })
})

describe('the night report says who covered the door, in words (E-123)', () => {
  test('the duty manager by name, or an account that has gone', () => {
    expect(saysDoorCover('Rowan Ellis')).toBe('Door: Rowan Ellis covered it from the duty manager\'s shift')
    expect(saysDoorCover(null)).toBe('Door: the duty manager covered it from their own shift')
  })
})

describe('a door refusal names tonight\'s duty manager, who can open it (issue 1306)', () => {
  test('named where one is confirmed tonight', () => {
    const refusal = nightAuthorityRefusal('DOOR', 'Rowan')
    expect(refusal.statusCode).toBe(403)
    expect(refusal.statusMessage).toContain('a confirmed door shift')
    expect(refusal.statusMessage).toContain('Rowan, tonight\'s duty manager, can open the door')
  })

  test('the plain refusal where nobody is, and never for the till or the duty manager\'s own screens', () => {
    expect(nightAuthorityRefusal('DOOR')).toEqual(nightAuthorityRefusal('DOOR', null))
    expect(nightAuthorityRefusal('DOOR').statusMessage).not.toContain('tonight\'s duty manager')
    expect(nightAuthorityRefusal('BAR', 'Rowan').statusMessage).not.toContain('Rowan')
    expect(nightAuthorityRefusal('DUTY_MANAGER', 'Rowan').statusMessage).not.toContain('Rowan')
  })
})
