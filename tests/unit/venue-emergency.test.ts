import { describe, expect, test } from 'bun:test'
import { EMERGENCY_SERVICES, cardAddressDraft, emergencyCalls, emergencyCardComplete, emergencyCardForm, firstCallOf, saysCall } from '#shared/utils/venue-emergency'

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
    expect(withPhone('1 2')).toBe(false)
    expect(withPhone('+ 1 2')).toBe(false)
    expect(withPhone('1'.repeat(16))).toBe(false)
  })

  test('999 and 112 are never who to ring first, since the screen always offers them', () => {
    const withPhone = (firstCallPhone: string) => emergencyCardForm.safeParse({ address: filled.address, firstCallName: 'Emergency services', firstCallPhone }).success
    expect(withPhone('999')).toBe(false)
    expect(withPhone('9 9 9')).toBe(false)
    expect(withPhone('112')).toBe(false)
  })

  test('an overlong name is refused', () => {
    expect(emergencyCardForm.safeParse({ address: filled.address, firstCallName: 'x'.repeat(81), firstCallPhone: '8888' }).success).toBe(false)
  })
})

describe('who the screen rings, and in what order (issue 1519)', () => {
  const security = { firstCallName: 'University Security', firstCallPhone: '0115 951 8888' }
  const none = { firstCallName: null, firstCallPhone: null }
  const at = (venueName: string, card: typeof security | typeof none) => ({ ...card, venueName })
  const labels = (calls: { label: string }[]) => calls.map(call => call.label)

  test('a card with nobody named rings 999', () => {
    expect(firstCallOf(none)).toEqual(EMERGENCY_SERVICES)
    expect(EMERGENCY_SERVICES).toEqual({ name: '999', phone: '999' })
  })

  test('a card that names someone rings them', () => {
    expect(firstCallOf(security)).toEqual({ name: 'University Security', phone: '0115 951 8888' })
  })

  test('one campus venue offers security, then 999', () => {
    expect(labels(emergencyCalls([at('Studio', security)]))).toEqual(['Call University Security', 'Call 999'])
    expect(labels(emergencyCalls([at('The house', none)]))).toEqual(['Call 999'])
    expect(labels(emergencyCalls([]))).toEqual(['Call 999'])
  })

  // The cards lead with the reader's own venue, so the solid first action is their building's.
  test('the calls follow the cards, so the reader\'s own venue decides what comes first', () => {
    expect(labels(emergencyCalls([at('The house', none), at('Studio', security)]))).toEqual(['Call 999', 'Call University Security (Studio)'])
    expect(labels(emergencyCalls([at('Studio', security), at('The house', none)]))).toEqual(['Call University Security (Studio)', 'Call 999'])
  })

  test('one number is offered once, naming every venue it covers only when some do not', () => {
    const renamed = { firstCallName: 'Security', firstCallPhone: '01159518888' }
    expect(labels(emergencyCalls([at('Studio', security), at('Trent', renamed)]))).toEqual(['Call University Security', 'Call 999'])
    expect(labels(emergencyCalls([at('Studio', security), at('Trent', renamed), at('The house', none)]))).toEqual(['Call University Security (Studio, Trent)', 'Call 999'])
  })

  test('each call carries the link the phone dials, with no spaces', () => {
    const [first, last] = emergencyCalls([at('Studio', { firstCallName: 'Security', firstCallPhone: '+44 115 951 8888' })])
    expect(first).toMatchObject({ href: 'tel:+441159518888', digits: '441159518888' })
    expect(last).toMatchObject({ href: 'tel:999', digits: '999' })
  })

  test('the sheet names who and the number before anything dials', () => {
    const [first, last] = emergencyCalls([at('Studio', security)])
    expect(saysCall(first!)).toBe('This rings University Security on 0115 951 8888 from the phone you are holding. Have the address on the card ready to read.')
    expect(saysCall(last!)).toBe('This rings 999 from the phone you are holding. Have the address on the card ready to read.')
  })
})

// A tap in a pocket or a dark foyer must not ring anybody: every emergency call on the screen
// opens a sheet first, and only the sheet's own button dials once the script runs (issue 1519).
describe('no emergency call dials on the first tap (issue 1519)', () => {
  test('every pinned call stops its own link and opens the sheet instead', async () => {
    const screen = await Bun.file('app/pages/tonight/emergency.vue').text()
    expect(screen).not.toContain('to="tel:999"')
    expect(screen).toContain('event.preventDefault()')
    expect(screen).toContain('<NightSheet')
  })
})
