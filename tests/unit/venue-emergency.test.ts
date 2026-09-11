import { describe, expect, test } from 'bun:test'
import { emergencyCardComplete, emergencyCardForm } from '#shared/utils/venue-emergency'

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
