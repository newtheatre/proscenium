import { describe, expect, test } from 'bun:test'
import { isOpen, requireOpenSession } from '#server/utils/till'
import { closeTillSessionForm, tillScopeForm } from '#shared/utils/till'
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

describe('closing names which session', () => {
  test('an empty id is refused', () => {
    expect(closeTillSessionForm.safeParse({ id: '' }).success).toBe(false)
  })

  test('an id is enough', () => {
    expect(closeTillSessionForm.safeParse({ id: 'till-1' })).toMatchObject({ success: true, data: { id: 'till-1' } })
  })
})
