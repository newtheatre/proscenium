import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import { saysShowDates, saysShowSeasonLine, saysShowStanding, saysShowVenues } from '#shared/utils/programme'
import type { ShowStanding } from '#shared/utils/programme'

// What a row of the shows list says (D-132 criterion 3, from the committee's `admin-shows` mockup).
// Every one of these is a sentence a reader acts on, so none of them is a colour alone (K-101).

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

const WED = seconds(fromLondonWallClock(2026, 11, 4, 19, 30))
const SAT = seconds(fromLondonWallClock(2026, 11, 7, 19, 30))
const MON = seconds(fromLondonWallClock(2026, 11, 9, 19, 30))
const NOW = fromLondonWallClock(2026, 11, 5, 12, 0)

describe('a run of performances reads as a run of dates', () => {
  test('a run states both ends, and a single night states one', () => {
    expect(saysShowDates(WED, SAT)).toBe('Wed 4 to Sat 7 Nov')
    expect(saysShowDates(MON, MON)).toBe('Mon 9 Nov')
  })

  test('a run crossing a month names the month at both ends', () => {
    const dec = seconds(fromLondonWallClock(2026, 12, 2, 19, 30))
    expect(saysShowDates(seconds(fromLondonWallClock(2026, 11, 30, 19, 30)), dec)).toBe('Mon 30 Nov to Wed 2 Dec')
  })

  test('nothing scheduled says so rather than drawing an empty cell', () => {
    expect(saysShowDates(null, null)).toBe('Not scheduled')
  })
})

describe('the venues a show plays', () => {
  test('one venue is named, several are counted, none says so', () => {
    expect(saysShowVenues('Main Hall')).toBe('Main Hall')
    expect(saysShowVenues('Main Hall,Studio')).toBe('Main Hall and Studio')
    expect(saysShowVenues('Main Hall,Studio,The Lakeside')).toBe('3 venues')
    expect(saysShowVenues(null)).toBe('None yet')
  })
})

const show = (over: Partial<Parameters<typeof saysShowStanding>[0]> = {}) => ({
  status: 'PUBLISHED' as const,
  onSaleCount: 2,
  performanceCount: 2,
  lastPerformanceAt: SAT,
  ...over,
})

const standing = (over: Partial<Parameters<typeof saysShowStanding>[0]> = {}): ShowStanding =>
  saysShowStanding(show(over), NOW)

describe('where a show stands, in one word a reader acts on', () => {
  test('a draft is a draft whatever its performances say', () => {
    expect(standing({ status: 'DRAFT', onSaleCount: 0 })).toMatchObject({ key: 'DRAFT', says: 'Draft' })
  })

  test('a published show with something on sale is on sale', () => {
    expect(standing()).toMatchObject({ key: 'ON_SALE', says: 'On sale' })
  })

  test('a published show whose last night has passed is completed', () => {
    const past = seconds(fromLondonWallClock(2026, 10, 17, 19, 30))
    expect(standing({ lastPerformanceAt: past })).toMatchObject({ key: 'COMPLETED', says: 'Completed' })
  })

  test('a published show with nothing on sale says so rather than claiming to be on sale', () => {
    expect(standing({ onSaleCount: 0 })).toMatchObject({ key: 'PUBLISHED', says: 'Off sale' })
  })
})

describe('the line under the heading counts what the page is showing', () => {
  test('it names the season, the total and the two states that matter', () => {
    expect(saysShowSeasonLine(6, 3, 2, 'Autumn 26/27')).toBe('Autumn 26/27: 6 shows, 3 on sale, 2 drafts')
  })

  test('with no season chosen it counts the estate', () => {
    expect(saysShowSeasonLine(6, 3, 2, null)).toBe('Every season: 6 shows, 3 on sale, 2 drafts')
  })

  test('one of a thing is one, not one s', () => {
    expect(saysShowSeasonLine(1, 1, 1, null)).toBe('Every season: 1 show, 1 on sale, 1 draft')
  })

  test('nothing to count says so', () => {
    expect(saysShowSeasonLine(0, 0, 0, 'Autumn 26/27')).toBe('Autumn 26/27: no shows yet')
  })
})
