import { describe, expect, test } from 'bun:test'
import { boardWindowBounds, boardWindowQuery, BOARD_WINDOW_NIGHTS, defaultBoardWindow, saysStaffing } from '#shared/utils/rota-board'
import { ROTA_FLOW, rotaStepAfter } from '#shared/utils/rota-flow'
import { showNightBounds } from '#shared/utils/show-night'

// The rota as one workflow (K-123 criterion 12) and the board's date window (E-107 criterion 7),
// both pure logic; the route's half is proved in `tests/integration/rota-board.test.ts`.

describe('the rota flow names its own order (K-123 criterion 12)', () => {
  test('the four steps run templates, board, openings, approvals', () => {
    expect(ROTA_FLOW.map(step => step.key)).toEqual(['templates', 'board', 'openings', 'approvals'])
  })

  test('every step names a console route under the rota group', () => {
    for (const step of ROTA_FLOW) expect(step.to).toStartWith('/rota/manage/')
  })

  test('the way on to a step is a verb and its object, as a console control is', () => {
    expect(rotaStepAfter('templates')?.onward).toBe('Fill the rota')
    expect(rotaStepAfter('openings')?.onward).toBe('Approve the claims')
  })

  test('each step but the last names the one after it', () => {
    expect(rotaStepAfter('templates')?.key).toBe('board')
    expect(rotaStepAfter('board')?.key).toBe('openings')
    expect(rotaStepAfter('openings')?.key).toBe('approvals')
  })

  test('the last step names nothing after it rather than looping back', () => {
    expect(rotaStepAfter('approvals')).toBeNull()
  })

  test('a step the flow does not hold is not guessed at', () => {
    expect(rotaStepAfter('safety')).toBeNull()
  })
})

describe('the board opens on the coming fortnight (E-107 criterion 7)', () => {
  test('a fortnight is fourteen nights', () => {
    expect(BOARD_WINDOW_NIGHTS).toBe(14)
  })

  test('the window starts on the London night the clock is in and runs thirteen more', () => {
    expect(defaultBoardWindow(new Date('2026-09-21T09:00:00Z'))).toEqual({ from: '2026-09-21', to: '2026-10-04' })
  })

  test('before 04:00 the window still opens on the night in progress (0014)', () => {
    expect(defaultBoardWindow(new Date('2026-09-22T01:30:00Z')).from).toBe('2026-09-21')
  })

  test('a window crossing the October clock change keeps counting nights, not seconds', () => {
    const { from, to } = boardWindowBounds({ from: '2026-10-20', to: '2026-11-02' })
    expect(to - from).toBe(14 * 86400 + 3600)
  })
})

describe('the window is read as show nights, 04:00 to 04:00 (0014)', () => {
  test('the first night begins at its own 04:00 London', () => {
    const { from } = boardWindowBounds({ from: '2026-09-21', to: '2026-09-21' })
    expect(from).toBe(Math.floor(showNightBounds('2026-09-21').from.getTime() / 1000))
  })

  test('the last night is held whole, so a performance at 01:00 is still inside it', () => {
    const { to } = boardWindowBounds({ from: '2026-09-21', to: '2026-10-04' })
    expect(to).toBe(Math.floor(showNightBounds('2026-10-04').to.getTime() / 1000))
  })
})

describe('the board refuses a window it cannot read (K-129 criterion 5)', () => {
  test('a pair of nights is accepted', () => {
    expect(boardWindowQuery.safeParse({ from: '2026-09-21', to: '2026-10-04' }).success).toBe(true)
  })

  test('a window running backwards is refused', () => {
    expect(boardWindowQuery.safeParse({ from: '2026-10-04', to: '2026-09-21' }).success).toBe(false)
  })

  test('a day the calendar does not have is refused', () => {
    expect(boardWindowQuery.safeParse({ from: '2026-02-30', to: '2026-03-04' }).success).toBe(false)
  })

  test('a window longer than a season is refused rather than read whole', () => {
    expect(boardWindowQuery.safeParse({ from: '2026-09-21', to: '2028-09-21' }).success).toBe(false)
  })
})

// Nought confirmed of nought read "Fully staffed" on a night nobody was rostered for (issue 1319).
describe('a card states its staffing in words, and nobody rostered is not fully staffed (issue 1319)', () => {
  const shifts = (...statuses: ('OPEN' | 'CLAIMED' | 'CONFIRMED')[]) => statuses.map(status => ({ status }))

  test('no shifts at a venue we run is the gap it is, and says what to do', () => {
    expect(saysStaffing({ shifts: [], isExternal: false })).toEqual({ says: 'No shifts: nobody is rostered', tone: 'warning' })
  })

  test('no shifts at an external venue is a fact, not a gap', () => {
    expect(saysStaffing({ shifts: [], isExternal: true })).toEqual({ says: 'Not rostered', tone: 'neutral' })
  })

  test('every shift confirmed is fully staffed, and any other is short', () => {
    expect(saysStaffing({ shifts: shifts('CONFIRMED', 'CONFIRMED'), isExternal: false })).toEqual({ says: 'Fully staffed', tone: 'success' })
    expect(saysStaffing({ shifts: shifts('CONFIRMED', 'OPEN'), isExternal: false })).toEqual({ says: 'Needs people', tone: 'warning' })
    expect(saysStaffing({ shifts: shifts('CLAIMED'), isExternal: true })).toEqual({ says: 'Needs people', tone: 'warning' })
  })

  test('a bar opening carries no venue flag and reads as one of ours', () => {
    expect(saysStaffing({ shifts: [] }).says).toBe('No shifts: nobody is rostered')
  })
})
