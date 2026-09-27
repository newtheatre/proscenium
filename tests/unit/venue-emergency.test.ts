import { describe, expect, test } from 'bun:test'
import { EMERGENCY_SERVICES, cardAddressDraft, emergencyCallHref, emergencyCalls, emergencyCardComplete, emergencyCardForm, firstCallOf } from '#shared/utils/venue-emergency'

// E-113's pure validation. What the database holds is proved against the real migrations in
// `tests/integration/venue-emergency.test.ts`.

const filled = {
  address: 'The Nottingham New Theatre, Cherry Tree Hill, University Park, Nottingham NG7 2RD',
  assemblyPoint: 'The car park',
  exits: 'Two, both stage left',
  isolationPoints: 'Lighting in the box, gas in the corridor',
  firstAidKit: 'Behind the bar',
  defibrillator: 'Foyer wall by the box office',
  firstAiders: 'Marian, Tuck',
  firePanel: 'Foyer, left of the main doors',
  what3words: 'towns.match.press',
  notes: 'Silence the panel only after the sweep',
}

describe('a card names the building, and the address is the one thing it must have (issue 902)', () => {
  test('every field parses when given', () => {
    expect(emergencyCardForm.safeParse(filled).success).toBe(true)
  })

  test('the address is required: it is what gets read to a 999 handler', () => {
    const parsed = emergencyCardForm.safeParse({ ...filled, address: undefined })
    expect(parsed.success).toBe(false)
  })

  test('a blank address is no address', () => {
    expect(emergencyCardForm.safeParse({ ...filled, address: '   ' }).success).toBe(false)
  })

  test('everything except the address is still optional', () => {
    const parsed = emergencyCardForm.parse({ address: filled.address })
    expect(parsed).toMatchObject({
      assemblyPoint: null,
      exits: null,
      isolationPoints: null,
      firstAidKit: null,
      defibrillator: null,
      firstAiders: null,
      firePanel: null,
      what3words: null,
      notes: null,
    })
  })

  test('blank strings settle to null rather than empty text', () => {
    const parsed = emergencyCardForm.parse({ address: filled.address, assemblyPoint: '   ', exits: '', firePanel: ' ' })
    expect(parsed.assemblyPoint).toBeNull()
    expect(parsed.exits).toBeNull()
    expect(parsed.firePanel).toBeNull()
  })

  test('an overlong field is refused', () => {
    expect(emergencyCardForm.safeParse({ ...filled, notes: 'x'.repeat(2001) }).success).toBe(false)
    expect(emergencyCardForm.safeParse({ ...filled, what3words: 'x'.repeat(101) }).success).toBe(false)
    expect(emergencyCardForm.safeParse({ ...filled, address: 'x'.repeat(1001) }).success).toBe(false)
  })
})

describe('what counts as a card the committee has actually filed', () => {
  test('an address and an assembly point is a card', () => {
    expect(emergencyCardComplete({ address: filled.address, assemblyPoint: 'The car park' })).toBe(true)
  })

  test('either one missing is not', () => {
    expect(emergencyCardComplete({ address: null, assemblyPoint: 'The car park' })).toBe(false)
    expect(emergencyCardComplete({ address: filled.address, assemblyPoint: null })).toBe(false)
    expect(emergencyCardComplete(null)).toBe(false)
  })
})

// The card's own address is the one read to 999; the venue's address for audiences only
// prefills it before the card has one (issue 1352).
describe('the address to read to 999 starts from the venue, once', () => {
  test('a venue with no card yet offers its address for audiences', () => {
    expect(cardAddressDraft(null, 'Cherry Tree Hill, Nottingham NG7 2RD')).toBe('Cherry Tree Hill, Nottingham NG7 2RD')
  })

  test('once the card has its own, the venue\'s is never offered again', () => {
    expect(cardAddressDraft('Stage door, Cherry Tree Hill', 'Cherry Tree Hill, Nottingham NG7 2RD')).toBe('Stage door, Cherry Tree Hill')
  })

  test('with neither, the field is empty', () => {
    expect(cardAddressDraft(null, null)).toBe('')
  })
})

// Issue 1519: a campus venue rings estates security first, so the card names who that is and
// the screen offers it ahead of 999, which stays on the screen for every venue.
describe('a card may name who to ring first (issue 1519)', () => {
  const security = { firstCallName: 'University Security', firstCallPhone: '0115 951 8888' }

  test('a name and a number parse together, trimmed', () => {
    const parsed = emergencyCardForm.parse({ address: filled.address, firstCallName: ' University Security ', firstCallPhone: ' 0115 951 8888 ' })
    expect(parsed).toMatchObject(security)
  })

  test('with neither, the card rings 999 as it always has', () => {
    expect(emergencyCardForm.parse({ address: filled.address })).toMatchObject({ firstCallName: null, firstCallPhone: null })
    expect(emergencyCardForm.parse({ address: filled.address, firstCallName: ' ', firstCallPhone: '' })).toMatchObject({ firstCallName: null, firstCallPhone: null })
  })

  test('one without the other is refused, since the screen can ring neither', () => {
    expect(emergencyCardForm.safeParse({ address: filled.address, firstCallName: 'University Security' }).success).toBe(false)
    expect(emergencyCardForm.safeParse({ address: filled.address, firstCallPhone: '0115 951 8888' }).success).toBe(false)
  })

  test('a number is digits, spaces and a leading plus, and nothing a phone cannot dial', () => {
    const withPhone = (firstCallPhone: string) => emergencyCardForm.safeParse({ address: filled.address, firstCallName: 'Security', firstCallPhone }).success
    expect(withPhone('+44 115 951 8888')).toBe(true)
    expect(withPhone('8888')).toBe(true)
    expect(withPhone('0115-951-8888')).toBe(false)
    expect(withPhone('ring the lodge')).toBe(false)
    expect(withPhone('12')).toBe(false)
    expect(withPhone('1'.repeat(21))).toBe(false)
  })

  test('an overlong name is refused', () => {
    expect(emergencyCardForm.safeParse({ address: filled.address, firstCallName: 'x'.repeat(81), firstCallPhone: '8888' }).success).toBe(false)
  })
})

describe('who the screen rings, and in what order (issue 1519)', () => {
  const security = { firstCallName: 'University Security', firstCallPhone: '0115 951 8888' }
  const none = { firstCallName: null, firstCallPhone: null }

  test('a card with nobody named rings 999', () => {
    expect(firstCallOf(none)).toEqual(EMERGENCY_SERVICES)
    expect(EMERGENCY_SERVICES).toEqual({ name: '999', phone: '999' })
  })

  test('a card that names someone rings them', () => {
    expect(firstCallOf(security)).toEqual({ name: 'University Security', phone: '0115 951 8888' })
  })

  test('every named first call leads, once each by number, and 999 is always last', () => {
    expect(emergencyCalls([security, none, { firstCallName: 'Security', firstCallPhone: '01159518888' }])).toEqual([
      { name: 'University Security', phone: '0115 951 8888' },
      EMERGENCY_SERVICES,
    ])
    expect(emergencyCalls([none, security])).toEqual([{ name: 'University Security', phone: '0115 951 8888' }, EMERGENCY_SERVICES])
    expect(emergencyCalls([none])).toEqual([EMERGENCY_SERVICES])
    expect(emergencyCalls([])).toEqual([EMERGENCY_SERVICES])
  })

  test('a card that names 999 itself does not offer it twice', () => {
    expect(emergencyCalls([{ firstCallName: 'Emergency services', firstCallPhone: '999' }])).toEqual([{ name: 'Emergency services', phone: '999' }])
  })

  test('the link the phone dials carries no spaces', () => {
    expect(emergencyCallHref({ name: 'University Security', phone: '0115 951 8888' })).toBe('tel:01159518888')
    expect(emergencyCallHref({ name: 'Security', phone: '+44 115 951 8888' })).toBe('tel:+441159518888')
    expect(emergencyCallHref(EMERGENCY_SERVICES)).toBe('tel:999')
  })
})

// A tap in a pocket or a dark foyer must not ring anybody: every emergency call on the screen
// opens a sheet first, and only the sheet's own button dials (issue 1519).
describe('no emergency call dials on the first tap (issue 1519)', () => {
  test('the screen pins no telephone link of its own', async () => {
    const screen = await Bun.file('app/pages/tonight/emergency.vue').text()
    expect(screen).not.toContain('to="tel:999"')
    expect(screen).toContain('emergencyCallHref(')
    expect(screen).toContain('<NightSheet')
  })
})
