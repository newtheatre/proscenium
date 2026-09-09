import { describe, expect, test } from 'bun:test'
import { emergencyCardForm } from '#shared/utils/venue-emergency'

// E-113's pure validation. What the database holds is proved against the real migrations in
// `tests/integration/venue-emergency.test.ts`.

describe('a card names the building, every field optional (criterion 1)', () => {
  test('every field parses when given', () => {
    const parsed = emergencyCardForm.safeParse({
      assemblyPoint: 'The car park',
      exits: 'Two, both stage left',
      isolationPoints: 'Lighting in the box, gas in the corridor',
      what3words: 'towns.match.press',
      notes: 'The nearest defibrillator is in the foyer',
    })
    expect(parsed.success).toBe(true)
  })

  test('an entirely empty card still parses: nothing here is required', () => {
    expect(emergencyCardForm.safeParse({}).success).toBe(true)
    const parsed = emergencyCardForm.parse({})
    expect(parsed).toMatchObject({ assemblyPoint: null, exits: null, isolationPoints: null, what3words: null, notes: null })
  })

  test('blank strings settle to null rather than empty text', () => {
    const parsed = emergencyCardForm.parse({ assemblyPoint: '   ', exits: '' })
    expect(parsed.assemblyPoint).toBeNull()
    expect(parsed.exits).toBeNull()
  })

  test('an overlong field is refused', () => {
    expect(emergencyCardForm.safeParse({ notes: 'x'.repeat(2001) }).success).toBe(false)
    expect(emergencyCardForm.safeParse({ what3words: 'x'.repeat(101) }).success).toBe(false)
  })
})
