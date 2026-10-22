import { describe, expect, test } from 'bun:test'
import { heldNightVenue, heldNightVenueFromCookie, nightVenueChoices, nightVenueExpires, nightVenueStep } from '#shared/utils/night-venue'
import type { NightVenueOption } from '#shared/utils/night-venue'

// The hub's venue choice on a night two venues run (0230).

const NIGHT = '2026-10-21'

const venue = (venueId: string, onShift = false): NightVenueOption => ({ venueId, venueName: venueId, performances: [], onShift })

describe('a chosen venue is tonight\'s alone', () => {
  test('tonight\'s choice is read back', () => {
    expect(heldNightVenue({ night: NIGHT, venueId: 'studio' }, NIGHT)).toBe('studio')
  })

  test('another night, an empty venue or no shape at all is nothing chosen', () => {
    expect(heldNightVenue({ night: '2026-10-20', venueId: 'studio' }, NIGHT)).toBeNull()
    expect(heldNightVenue({ night: NIGHT, venueId: '' }, NIGHT)).toBeNull()
    expect(heldNightVenue(null, NIGHT)).toBeNull()
    expect(heldNightVenue('studio', NIGHT)).toBeNull()
  })

  test('the server reads the raw cookie, and a value that is not JSON is nothing chosen', () => {
    expect(heldNightVenueFromCookie(JSON.stringify({ night: NIGHT, venueId: 'studio' }), NIGHT)).toBe('studio')
    expect(heldNightVenueFromCookie('studio', NIGHT)).toBeNull()
    expect(heldNightVenueFromCookie(undefined, NIGHT)).toBeNull()
  })

  test('it expires when the night ends at 04:00 London', () => {
    expect(nightVenueExpires(NIGHT).toISOString()).toBe('2026-10-22T03:00:00.000Z')
  })
})

describe('the hub asks for a venue only where the viewer could work more than one', () => {
  const venues = [venue('house', true), venue('studio'), venue('rehearsal')]

  test('an officer may work any running venue', () => {
    expect(nightVenueChoices(venues, true).map(one => one.venueId)).toEqual(['house', 'studio', 'rehearsal'])
  })

  test('a volunteer chooses only between the venues their shifts are at', () => {
    expect(nightVenueChoices(venues, false).map(one => one.venueId)).toEqual(['house'])
  })

  test('one venue or none is nothing to choose', () => {
    expect(nightVenueStep([venue('house')], null)).toBe('NONE')
    expect(nightVenueStep([], 'house')).toBe('NONE')
  })

  test('two venues ask until one of them is chosen, and a choice outside them asks again', () => {
    const two = [venue('house'), venue('studio')]
    expect(nightVenueStep(two, null)).toBe('CHOOSE')
    expect(nightVenueStep(two, 'rehearsal')).toBe('CHOOSE')
    expect(nightVenueStep(two, 'studio')).toBe('CHOSEN')
  })
})
