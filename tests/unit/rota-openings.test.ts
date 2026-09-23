import { describe, expect, test } from 'bun:test'
import {
  BAR_OPENING_STATUSES,
  barOpeningForm,
  openingClaimRefusal,
  openingSlotRemoveRefusal,
  openingUnconfirmRefusal,
  saysBarOpeningStatus,
} from '#shared/utils/rota-openings'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'

// What a bar opening names, and what it refuses to name (E-130, 0077).

const NIGHT = currentShowNight()
const NIGHT_START = Math.floor(showNightBounds(NIGHT).from.getTime() / 1000)

const PLANNED = {
  venueId: 'venue-a',
  night: NIGHT,
  label: 'A society social',
  startsAt: NIGHT_START + 14 * 3600,
  endsAt: NIGHT_START + 19 * 3600,
}

describe('what a planned opening names (E-130 criterion 1)', () => {
  test('a venue, a night, a label and a window are accepted', () => {
    expect(barOpeningForm.safeParse(PLANNED).success).toBe(true)
  })

  test('an opening needs a label, because it stands in for a show title', () => {
    expect(barOpeningForm.safeParse({ ...PLANNED, label: '   ' }).success).toBe(false)
  })

  test('the bar closes after it opens', () => {
    expect(barOpeningForm.safeParse({ ...PLANNED, endsAt: PLANNED.startsAt }).success).toBe(false)
    expect(barOpeningForm.safeParse({ ...PLANNED, endsAt: PLANNED.startsAt - 60 }).success).toBe(false)
  })

  // The list filters on the clock and authority resolves on the night, so an opening filed under
  // one and worked on the other would let people in on an evening it was never planned for.
  test('the night and the opening time have to agree (0014)', () => {
    const nextNight = barOpeningForm.safeParse({ ...PLANNED, startsAt: PLANNED.startsAt + 24 * 3600, endsAt: PLANNED.endsAt + 24 * 3600 })
    expect(nextNight.success).toBe(false)
  })

  test('an opening is planned or cancelled, and both have words', () => {
    expect([...BAR_OPENING_STATUSES]).toEqual(['PLANNED', 'CANCELLED'])
    expect(BAR_OPENING_STATUSES.map(saysBarOpeningStatus)).toEqual(['Planned', 'Cancelled'])
  })
})

describe('why a slot refused what was asked of it (E-130 criterion 3)', () => {
  test('a losing claim is told the slot has gone, and a second claim that they already hold one', () => {
    expect(openingClaimRefusal('CLAIMED')).toContain('already been taken')
    expect(openingClaimRefusal('CONFIRMED')).toContain('already been taken')
    expect(openingClaimRefusal('OPEN')).toContain('already hold a slot')
  })

  // A declined claim is reopened by the same write, because an opening has no approvals queue of
  // its own to clear it from.
  test('standing a slot down refuses only the two statuses that name nobody', () => {
    expect(openingUnconfirmRefusal('CANCELLED')).toContain('cancelled')
    expect(openingUnconfirmRefusal('OPEN')).toContain('already open')
  })
})

describe('why removing a slot was refused (E-130 criterion 7)', () => {
  test('a slot that names somebody is stood down first, whatever it names them as', () => {
    for (const status of ['CLAIMED', 'CONFIRMED', 'DECLINED'] as const) {
      expect(openingSlotRemoveRefusal({ status, openingStatus: 'PLANNED' }, 3)).toContain('stand them down first')
    }
  })

  test('the last slot is not removed: cancelling is how an opening stops being staffed', () => {
    expect(openingSlotRemoveRefusal({ status: 'OPEN', openingStatus: 'PLANNED' }, 1)).toContain('cancel the opening')
  })

  test('a cancelled opening, and a slot already gone, say so rather than anything else', () => {
    expect(openingSlotRemoveRefusal({ status: 'CANCELLED', openingStatus: 'CANCELLED' }, 2)).toContain('cancelled')
    expect(openingSlotRemoveRefusal(null, 2)).toContain('already been removed')
  })
})
