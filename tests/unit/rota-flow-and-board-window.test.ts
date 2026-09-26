import { describe, expect, test } from 'bun:test'
import { BOARD_WAITING_HREF, boardWindowBounds, boardWindowQuery, BOARD_WINDOW_NIGHTS, defaultBoardWindow } from '#shared/utils/rota-board'
import { ROTA_FLOW, rotaStepAfter } from '#shared/utils/rota-flow'
import { showNightBounds } from '#shared/utils/show-night'

// The rota as one workflow (K-123 criterion 12) and the board's date window (E-107 criterion 7),
// both pure logic; the route's half is proved in `tests/integration/rota-board.test.ts`.

// Issue #1365: approving is done on the board, under its "Waiting for confirmation" filter, so the
// flow is three screens and ends on the openings.
describe('the rota flow names its own order (K-123 criterion 12)', () => {
  test('the three steps run templates, board, openings', () => {
    expect(ROTA_FLOW.map(step => step.key)).toEqual(['templates', 'board', 'openings'])
  })

  test('every step names a console route under the rota group', () => {
    for (const step of ROTA_FLOW) expect(step.to).toStartWith('/rota/manage/')
  })

  test('the way on to a step is a verb and its object, as a console control is', () => {
    expect(rotaStepAfter('templates')?.onward).toBe('Fill the rota')
    expect(rotaStepAfter('board')?.onward).toBe('Plan the bar openings')
  })

  test('each step but the last names the one after it', () => {
    expect(rotaStepAfter('templates')?.key).toBe('board')
    expect(rotaStepAfter('board')?.key).toBe('openings')
  })

  test('the last step names nothing after it rather than looping back', () => {
    expect(rotaStepAfter('openings')).toBeNull()
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

// Issue #1365 and E-105 criterion 2: the queue of claims is a filter on the board, reached from
// the old approvals address, rather than a second screen confirming the same shifts.
describe('the board filters to the claims waiting for confirmation', () => {
  test('the filter reads as yes or no, and is off unless asked for', () => {
    expect(boardWindowQuery.parse({ from: '2026-09-21', to: '2026-10-04' }).waiting).toBe(false)
    expect(boardWindowQuery.parse({ from: '2026-09-21', to: '2026-10-04', waiting: 'true' }).waiting).toBe(true)
  })

  test('the old approvals address forwards to the filter', () => {
    expect(BOARD_WAITING_HREF).toBe('/rota/manage/shifts?waiting=true')
  })
})
