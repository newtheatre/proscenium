import { describe, expect, test } from 'bun:test'
import { isOpen, requireOpenSession } from '#server/utils/till'
import { closeTillSessionForm } from '#shared/utils/reconciliation'
import { TILL_VENUE_DEVICE_KEY, chargePaths, recallTillVenue, rememberTillVenue, rememberedBarAnswers, tillScopeForm } from '#shared/utils/till'
import type { TillSession } from '#shared/utils/till'

// F-102's write-path rules over a session object, with no database beneath them: the schema's
// own constraints are proved in tests/integration/till.test.ts.

const aSession = (over: Partial<TillSession> = {}): TillSession => ({
  id: 'till-1',
  venueId: 'venue-1',
  night: '2026-09-04',
  openedBy: 'u-1',
  openedAt: 1000,
  closedBy: null,
  closedAt: null,
  expectedTotalPence: null,
  actualZPence: null,
  variancePence: null,
  varianceNote: null,
  ...over,
})

describe('a session is open exactly when nobody has closed it (F-102 criterion 3)', () => {
  test('no session at all is not open', () => {
    expect(isOpen(null)).toBe(false)
  })

  test('a freshly opened session is open', () => {
    expect(isOpen(aSession())).toBe(true)
  })

  test('a session with a closer is not open, whatever else it carries', () => {
    expect(isOpen(aSession({ closedBy: 'u-2', closedAt: 2000 }))).toBe(false)
  })
})

describe('requireOpenSession refuses a sale with nothing to hang it off (F-102 criterion 3)', () => {
  test('no session names what would fix it', () => {
    expect(() => requireOpenSession(null)).toThrow('No till session is open here')
  })

  test('a closed session refuses the same way as no session at all', () => {
    expect(() => requireOpenSession(aSession({ closedBy: 'u-2', closedAt: 2000 }))).toThrow('No till session is open here')
  })

  test('an open session is returned rather than refused', () => {
    const session = aSession()
    expect(requireOpenSession(session)).toBe(session)
  })
})

describe('the till scope names a venue or a performance, and never a night (F-101 criterion 1)', () => {
  test('nothing at all is valid: the common case is the one venue running tonight', () => {
    expect(tillScopeForm.safeParse({}).success).toBe(true)
  })

  test('a night is not part of the till\'s own vocabulary', () => {
    const parsed = tillScopeForm.safeParse({ night: '2026-09-04' })
    expect(parsed.success && parsed.data).not.toHaveProperty('night')
  })
})

describe('closing names which session and what the reader read (F-118 criterion 3)', () => {
  test('an empty id is refused', () => {
    expect(closeTillSessionForm.safeParse({ id: '', actualZPence: 0 }).success).toBe(false)
  })

  test('an id and the reader\'s own reading are enough; a note is not required by the shape alone', () => {
    expect(closeTillSessionForm.safeParse({ id: 'till-1', actualZPence: 2500 }))
      .toMatchObject({ success: true, data: { id: 'till-1', actualZPence: 2500 } })
  })

  test('the reader\'s reading is required: whether it varies from expected is the route\'s own question', () => {
    expect(closeTillSessionForm.safeParse({ id: 'till-1' }).success).toBe(false)
  })

  test('a negative reading is refused: the reader never shows less than nothing', () => {
    expect(closeTillSessionForm.safeParse({ id: 'till-1', actualZPence: -1 }).success).toBe(false)
  })
})

function aStore() {
  const held = new Map<string, string>()
  return {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => {
      held.set(key, value)
    },
  }
}

describe('the device remembers tonight\'s bar, and only tonight\'s (F-124 criterion 3, 0014, issue 1257)', () => {
  test('a bar remembered tonight is recalled tonight', () => {
    const store = aStore()
    rememberTillVenue(store, '2026-09-24', 'venue-1')
    expect(recallTillVenue(store, '2026-09-24')).toBe('venue-1')
  })

  test('the next show night asks again rather than opening last night\'s bar', () => {
    const store = aStore()
    rememberTillVenue(store, '2026-09-24', 'venue-1')
    expect(recallTillVenue(store, '2026-09-25')).toBeNull()
  })

  test('a later choice replaces the earlier one', () => {
    const store = aStore()
    rememberTillVenue(store, '2026-09-24', 'venue-1')
    rememberTillVenue(store, '2026-09-24', 'venue-2')
    expect(recallTillVenue(store, '2026-09-24')).toBe('venue-2')
  })

  test('something unreadable under the key is nothing remembered, not a throw', () => {
    const store = aStore()
    store.setItem(TILL_VENUE_DEVICE_KEY, 'not json')
    expect(recallTillVenue(store, '2026-09-24')).toBeNull()
    store.setItem(TILL_VENUE_DEVICE_KEY, JSON.stringify({ night: '2026-09-24', venueId: 7 }))
    expect(recallTillVenue(store, '2026-09-24')).toBeNull()
  })

  test('a device that refuses storage still opens the till', () => {
    const refusing = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(() => rememberTillVenue(refusing, '2026-09-24', 'venue-1')).not.toThrow()
    expect(recallTillVenue(refusing, '2026-09-24')).toBeNull()
  })
})

// Decision 0096, F-124 criterion 1 as amended: one charge button under the thumb, whichever path.
describe('the till shows one way to charge, and keying by hand is the fallback link (0096)', () => {
  test('a phone with the hand-off offers SumUp, with keying the figure as the secondary link', () => {
    expect(chargePaths(true, false)).toEqual({ primary: 'sumup', secondary: 'typed' })
  })

  test('the laptop, or a till without the hand-off, keys the figure and offers nothing else', () => {
    expect(chargePaths(false, false)).toEqual({ primary: 'typed', secondary: null })
  })

  test('a tab never goes to the reader, whatever the device', () => {
    expect(chargePaths(true, true)).toEqual({ primary: 'tab', secondary: null })
    expect(chargePaths(false, true)).toEqual({ primary: 'tab', secondary: null })
  })
})

describe('the remembered bar answers only the guard\'s own question (F-125, issue 1257)', () => {
  test('a night that resolves its bar unaided never reaches for the device', () => {
    expect(rememberedBarAnswers(403, undefined, 'venue-1')).toBe(false)
    expect(rememberedBarAnswers(401, undefined, 'venue-1')).toBe(false)
  })

  test('the guard asking which bar is answered by tonight\'s remembered one', () => {
    expect(rememberedBarAnswers(400, undefined, 'venue-1')).toBe(true)
  })

  test('a bar named in the link, or nothing remembered, leaves the question to the picker', () => {
    expect(rememberedBarAnswers(400, 'venue-2', 'venue-1')).toBe(false)
    expect(rememberedBarAnswers(400, undefined, undefined)).toBe(false)
  })
})
