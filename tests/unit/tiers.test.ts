import { describe, expect, test } from 'bun:test'
import { bumpForm, nearest, outranks, rankOf, refusalToBump } from '#shared/utils/tiers'

// C-115's pure half. The order is configuration, so nothing here knows it: a committee that
// reorders the tiers reorders the rule (0012).

const ORDER = ['PRODUCTION', 'COMMITTEE', 'REHEARSAL', 'GENERAL']
const NOW = 1_800_000_000

describe('priority is the configured order, not this code', () => {
  test('the first tier outranks the last', () => {
    expect(outranks(ORDER, 'PRODUCTION', 'GENERAL')).toBe(true)
    expect(outranks(ORDER, 'GENERAL', 'PRODUCTION')).toBe(false)
  })

  test('a tier never outranks itself', () => {
    expect(outranks(ORDER, 'REHEARSAL', 'REHEARSAL')).toBe(false)
  })

  test('reordering the setting reorders the rule', () => {
    const reversed = [...ORDER].reverse()
    expect(outranks(reversed, 'GENERAL', 'PRODUCTION')).toBe(true)
  })

  // A booking made before a tier was renamed must not be able to bump anything.
  test('a tier the setting no longer lists ranks below everything', () => {
    expect(rankOf(ORDER, 'SOMETHING_OLD')).toBe(ORDER.length)
    expect(outranks(ORDER, 'SOMETHING_OLD', 'GENERAL')).toBe(false)
    expect(outranks(ORDER, 'GENERAL', 'SOMETHING_OLD')).toBe(true)
  })
})

describe('what may be bumped (criterion 2)', () => {
  const displaced = { status: 'CONFIRMED', tier: 'GENERAL', endsAt: NOW + 86_400 }

  test('a higher tier may take a confirmed booking', () => {
    expect(refusalToBump(ORDER, displaced, { tier: 'PRODUCTION' }, NOW)).toBeNull()
  })

  test('an equal tier may not', () => {
    expect(refusalToBump(ORDER, displaced, { tier: 'GENERAL' }, NOW)).toContain('higher priority')
  })

  test('a lower tier may not', () => {
    expect(refusalToBump(ORDER, { ...displaced, tier: 'PRODUCTION' }, { tier: 'GENERAL' }, NOW))
      .toContain('higher priority')
  })

  test.each(['PENDING_APPROVAL', 'CANCELLED', 'REJECTED', 'BUMPED'])('%s cannot be bumped', (status) => {
    expect(refusalToBump(ORDER, { ...displaced, status }, { tier: 'PRODUCTION' }, NOW))
      .toBe('Only a confirmed booking can be bumped')
  })

  test('a booking that has already happened cannot be bumped', () => {
    expect(refusalToBump(ORDER, { ...displaced, endsAt: NOW - 1 }, { tier: 'PRODUCTION' }, NOW))
      .toBe('That booking has already happened')
  })
})

describe('a bump carries its reason (criterion 2)', () => {
  const valid = { userId: 'u1', title: 'Dress run', tier: 'PRODUCTION', purpose: 'REHEARSAL', reason: 'Show week' }

  test('a reason is required', () => {
    expect(bumpForm.safeParse(valid).success).toBe(true)
    expect(bumpForm.safeParse({ ...valid, reason: '' }).success).toBe(false)
    expect(bumpForm.safeParse({ ...valid, reason: '   ' }).success).toBe(false)
  })

  test('so is who the room is being taken for', () => {
    expect(bumpForm.safeParse({ ...valid, userId: '' }).success).toBe(false)
  })
})

describe('the nearest equivalent slot (criterion 3)', () => {
  const at = (roomId: string, startsAt: number): { roomId: string, room: string, startsAt: number, endsAt: number, capacity: null } =>
    ({ roomId, room: roomId, startsAt, endsAt: startsAt + 7200, capacity: null })

  test('the same room wins over a closer time elsewhere', () => {
    const found = nearest([at('other', NOW + 3600), at('same', NOW + 86_400)], NOW, 'same')
    expect(found?.roomId).toBe('same')
  })

  test('within the same room, closest in time wins', () => {
    const found = nearest([at('same', NOW + 5 * 86_400), at('same', NOW + 86_400)], NOW, 'same')
    expect(found?.startsAt).toBe(NOW + 86_400)
  })

  test('a slot before the original counts as near as one after', () => {
    const found = nearest([at('same', NOW + 2 * 86_400), at('same', NOW - 86_400)], NOW, 'same')
    expect(found?.startsAt).toBe(NOW - 86_400)
  })

  test('another room is offered when the original has nothing', () => {
    expect(nearest([at('other', NOW + 86_400)], NOW, 'same')?.roomId).toBe('other')
  })

  test('nothing free is nothing offered', () => {
    expect(nearest([], NOW, 'same')).toBeUndefined()
  })
})
