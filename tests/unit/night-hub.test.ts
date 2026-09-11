import { describe, expect, test } from 'bun:test'
import { firstNameOf, groupedBoardCode, hubKpis, nightHeaderLine, onShiftLabel, passPressureAdvice, runningTimeLine } from '#shared/utils/night-hub'

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
  test('a capped house splits into reserved, collected and walk-up headroom', () => {
    expect(hubKpis({ sold: 61, admitted: 37, capacity: 86, remaining: 25 })).toEqual({
      reserved: 61,
      capacity: 86,
      collected: 37,
      headroom: 25,
      toCome: 24,
      collectedPercent: 71,
    })
  })

  test('an uncapped house says so rather than guessing a headroom', () => {
    expect(hubKpis({ sold: 12, admitted: 3, capacity: null, remaining: null })).toMatchObject({
      capacity: null,
      headroom: null,
      collectedPercent: null,
    })
  })

  test('more admitted than reserved never shows a negative number to come', () => {
    expect(hubKpis({ sold: 4, admitted: 6, capacity: 10, remaining: 6 }).toCome).toBe(0)
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
    expect(runningTimeLine(130, 1, 20)).toBe('2h 10 · one interval of 20 minutes')
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
