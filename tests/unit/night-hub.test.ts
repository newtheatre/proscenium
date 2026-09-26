import { describe, expect, test } from 'bun:test'
import { HUB_KPI_LABELS, checklistHint, compApprovalLine, doorStripLine, firstNameOf, groupedBoardCode, hubKpis, housePercentLine, nightHeaderLine, onShiftLabel, passPressureAdvice, runningTimeLine, saysIntervals, saysSeatsLeft, seesAccessTonight, staleBannerLine } from '#shared/utils/night-hub'

// The show-night hub's wording and numbers (E-112, E-127, issue 905). The screens place these; what
// they say is decided here, so one test holds it.

describe('the header line names the day, the curtain and the room (E-112 criterion 1)', () => {
  // 19:30 on Thursday 5 November 2026, British winter time, so London and UTC agree.
  const curtain = Math.floor(Date.UTC(2026, 10, 5, 19, 30) / 1000)

  test('the line reads as a volunteer would say it out loud', () => {
    expect(nightHeaderLine(curtain, 'Main Hall')).toBe('Thu 5 Nov · 19:30 · Main Hall')
  })

  test('a summer curtain is London wall clock, never the runtime zone (0014)', () => {
    const summer = Math.floor(Date.UTC(2026, 5, 4, 18, 30) / 1000)
    expect(nightHeaderLine(summer, 'Studio')).toBe('Thu 4 Jun · 19:30 · Studio')
  })
})

describe('the on-shift badge (0044)', () => {
  test('a shift gives the first name only', () => {
    expect(onShiftLabel('SHIFT', 'Marian Fitzwalter')).toBe('On shift · Marian')
  })

  test('an officer bypass never reads as a rota slot', () => {
    expect(onShiftLabel('OFFICER', 'Marian Fitzwalter')).toBe('Officer')
  })

  test('no resolved authority, no badge', () => {
    expect(onShiftLabel(null, 'Marian Fitzwalter')).toBeNull()
  })

  test('a shift with no name still says the person is on', () => {
    expect(onShiftLabel('SHIFT', '  ')).toBe('On shift')
  })

  test('a first name is the first word, whatever follows it', () => {
    expect(firstNameOf('Will Scarlet')).toBe('Will')
    expect(firstNameOf(null)).toBeNull()
  })
})

describe('the three tiles the door actually asks about (E-112 criterion 1)', () => {
  test('a capped house splits into sold, in and seats left', () => {
    expect(hubKpis({ sold: 61, admitted: 37, capacity: 86, remaining: 25 })).toEqual({
      sold: 61,
      capacity: 86,
      admitted: 37,
      seatsLeft: 25,
      toCome: 24,
      soldPercent: 71,
    })
  })

  test('an uncapped house says so rather than guessing the seats left', () => {
    expect(hubKpis({ sold: 12, admitted: 3, capacity: null, remaining: null })).toMatchObject({
      capacity: null,
      seatsLeft: null,
      soldPercent: null,
    })
  })

  test('more admitted than sold never shows a negative number to come', () => {
    expect(hubKpis({ sold: 4, admitted: 6, capacity: 10, remaining: 6 }).toCome).toBe(0)
  })
})

// One duty manager reads the hub, the glance, the door and the till in one interval, so the three
// house numbers carry one word each wherever they appear (issue 1150 item 11).
describe('one vocabulary for the house numbers (issue 1150 item 11)', () => {
  test('the labels are sold, in, to come and seats left', () => {
    expect(HUB_KPI_LABELS).toEqual({ sold: 'sold', admitted: 'in', seatsLeft: 'seats left', toCome: 'to come' })
  })

  test('an uncapped house reads as words a volunteer says out loud, never a symbol', () => {
    expect(saysSeatsLeft(null)).toBe('No cap')
  })

  test('a capped house reads as the count itself', () => {
    expect(saysSeatsLeft(25)).toBe('25')
    expect(saysSeatsLeft(0)).toBe('0')
  })
})

// The hub's checklist tile says what is left rather than repeating the screen's name (issue 1150
// item 3). Which phase is counted follows house open, the same boundary the warning banner uses.
describe('the checklist tile\'s hint (E-114, issue 1150 item 3)', () => {
  const pre = (done: boolean): { phase: 'PRE', done: boolean } => ({ phase: 'PRE', done })
  const post = (done: boolean): { phase: 'POST', done: boolean } => ({ phase: 'POST', done })

  test('before house open it counts the pre-show items left', () => {
    expect(checklistHint([pre(false), pre(false), pre(false), pre(true), post(false)], false)).toBe('3 pre-show items left')
  })

  test('one item left is singular', () => {
    expect(checklistHint([pre(false), pre(true)], false)).toBe('1 pre-show item left')
  })

  test('after house open it counts the post-show items left', () => {
    expect(checklistHint([pre(true), post(false), post(false)], true)).toBe('2 post-show items left')
  })

  test('nothing outstanding in either phase reads as done', () => {
    expect(checklistHint([pre(true), post(true)], false)).toBe('All ticked')
    expect(checklistHint([pre(true), post(true)], true)).toBe('All ticked')
  })

  // A phase settled while the other is not says what is actually left, never "All ticked".
  test('the other phase is named once this one is clear', () => {
    expect(checklistHint([pre(true), post(false)], false)).toBe('1 post-show item left')
    expect(checklistHint([pre(false), post(true)], true)).toBe('1 pre-show item left')
  })

  // A checklist the hub could not read is not a checklist with nothing left on it.
  test('nothing read at all names the destination rather than claiming it is clear', () => {
    expect(checklistHint([], false)).toBe('Pre-show and post-show')
  })
})

// The generic fallback is not a reason, and reading "That did not work. Try again." after a colon
// tells a duty manager nothing the first half did not (issue 1150 item 11).
describe('the stale banner (E-112 criterion 3)', () => {
  test('a reason worth reading follows the colon', () => {
    expect(staleBannerLine('The connection dropped.')).toBe('Showing what was last loaded: The connection dropped.')
  })

  test('no reason leaves the sentence alone', () => {
    expect(staleBannerLine(null)).toBe('Showing what was last loaded')
    expect(staleBannerLine('')).toBe('Showing what was last loaded')
  })
})

describe('pass pressure answers the door, not a statistician (E-112 criterion 1)', () => {
  test('no pass covers tonight, so there is no pressure to read', () => {
    expect(passPressureAdvice(0, 25)).toBe('No passes cover tonight.')
  })

  test('well under the seats left reads as comfortable', () => {
    expect(passPressureAdvice(9, 25)).toBe('Comfortable: admit pass holders freely.')
  })

  test('close to the seats left says so rather than reassuring', () => {
    expect(passPressureAdvice(20, 25)).toBe('Tight: admit pass holders and watch the walk-up queue.')
  })

  test('more passes than seats names the order to admit in', () => {
    expect(passPressureAdvice(30, 25)).toContain('More passes than seats left')
  })

  test('an uncapped house has nothing to be tight against', () => {
    expect(passPressureAdvice(9, null)).toBe('Uncapped house: admit pass holders freely.')
  })
})

describe('the running time line (E-112 criterion 1, issue 905)', () => {
  test('hours, minutes and the interval in one line', () => {
    expect(runningTimeLine(130, 1, 20)).toBe('2h 10 · 1 interval of 20 minutes')
  })

  test('no interval says straight through rather than nothing', () => {
    expect(runningTimeLine(95, 0, null)).toBe('1h 35 · straight through')
  })

  test('an unstated running time names what is missing, never a bare "Not yet stated"', () => {
    expect(runningTimeLine(null, 0, null)).toBe('Running time not yet stated · straight through')
  })
})

describe('tonight\'s board code is read out, not read off (issue 905)', () => {
  test('six digits group as two threes', () => {
    expect(groupedBoardCode('253082')).toBe('253 082')
  })

  test('anything that is not six digits is left exactly as it came', () => {
    expect(groupedBoardCode('2530')).toBe('2530')
  })
})

// The bar under the numbers counts sold over capacity, so the caption names that and not
// collected, which is the next number along (issue 1150 item 10).
describe('the house percentage says what it counts (issue 1150 item 10)', () => {
  test('a capped house names the sold share in the one vocabulary', () => {
    expect(housePercentLine(71)).toBe('71% of the house sold')
  })

  test('nothing sold is still a percentage, not a gap', () => {
    expect(housePercentLine(0)).toBe('0% of the house sold')
  })

  test('an uncapped house reads as the words the tile uses, never a figure', () => {
    expect(housePercentLine(null)).toBe('No cap on this house')
    expect(housePercentLine(null)).toContain(saysSeatsLeft(null))
  })
})

// Approving is one tap and gives money away, so the confirmation reads back the amount and who
// asked before that tap lands (issue 1150 item 10).
describe('the comp approval line (D-117, F-110, issue 1150 item 10)', () => {
  test('a bar round names the money and the person', () => {
    expect(compApprovalLine('Sam Yates', 1250)).toBe('£12.50 at the bar for Sam Yates.')
  })

  test('a ticket comp carries no amount and says so rather than nought pounds', () => {
    expect(compApprovalLine('Sam Yates', null)).toBe('A ticket for Sam Yates.')
  })

  test('a round that prices at nothing still reads as money, never as a ticket', () => {
    expect(compApprovalLine('Sam Yates', 0)).toBe('£0.00 at the bar for Sam Yates.')
  })
})

// Issue 1307: the door and the bar read the house too, and only the door and the duty manager
// read the access wording (D-127 criterion 3).
describe('who reads what on a show night (issue 1307, D-127 criterion 3)', () => {
  test('the door and the duty manager see tonight\'s access wording, the bar does not', () => {
    expect(seesAccessTonight('DOOR')).toBe(true)
    expect(seesAccessTonight('DUTY_MANAGER')).toBe(true)
    expect(seesAccessTonight('BAR')).toBe(false)
  })
})

describe('the strip under the door\'s camera (issue 1307)', () => {
  test('the intervals read the way the running time line reads them', () => {
    expect(saysIntervals(0, null)).toBe('straight through')
    expect(saysIntervals(1, 20)).toBe('1 interval of 20 minutes')
    expect(saysIntervals(2, null)).toBe('2 intervals')
  })

  test('the strip names the latecomer rule and the intervals, in the glance\'s own words', () => {
    expect(doorStripLine('AT_INTERVAL', 1, 20)).toBe('Latecomers admitted at the interval · 1 interval of 20 minutes')
    expect(doorStripLine('NOT_ADMITTED', 0, null)).toBe('Latecomers not admitted · straight through')
  })
})
