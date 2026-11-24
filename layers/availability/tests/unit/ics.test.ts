// T-AV-32: only start, end and level come out of a calendar file, within the window (I3, I4).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCalendar } from '../../server/ics'

const text = readFileSync(join(import.meta.dirname, '../fixtures/calendar.ics'), 'utf8')
const at = (iso: string) => Date.parse(iso)
const window = { from: at('2027-01-01T00:00:00Z'), to: at('2027-04-01T00:00:00Z'), zone: 'Europe/London' }

describe('readCalendar (T-AV-32)', () => {
  it('keeps busy, tentative as maybe, the all-day event as the whole local day, and recurrences with their changes', () => {
    const blocks = readCalendar(text, { ...window, tentativeAs: 'maybe', ours: uid => uid.endsWith('@site-marker') })
    expect(blocks).toEqual([
      { from: at('2027-01-12T09:00:00Z'), to: at('2027-01-12T11:00:00Z'), level: 'busy' },
      { from: at('2027-01-12T13:00:00Z'), to: at('2027-01-12T14:00:00Z'), level: 'maybe' },
      { from: at('2027-01-13T00:00:00Z'), to: at('2027-01-14T00:00:00Z'), level: 'busy' },
      { from: at('2027-01-14T10:00:00Z'), to: at('2027-01-14T12:00:00Z'), level: 'busy' },
      { from: at('2027-01-21T14:00:00Z'), to: at('2027-01-21T15:00:00Z'), level: 'busy' },
      { from: at('2027-01-28T10:00:00Z'), to: at('2027-01-28T12:00:00Z'), level: 'busy' },
    ])
    expect(JSON.stringify(blocks)).not.toMatch(/dentist|Private|letter|Lecture/)
  })

  it('counts tentative as busy or not at all, as the connection says, and keeps the site\'s own events without a marker check', () => {
    expect(readCalendar(text, { ...window, tentativeAs: 'busy' }).find(b => b.from === at('2027-01-12T13:00:00Z'))?.level).toBe('busy')
    expect(readCalendar(text, { ...window, tentativeAs: 'ignore' }).some(b => b.from === at('2027-01-12T13:00:00Z'))).toBe(false)
    expect(readCalendar(text, { ...window, tentativeAs: 'maybe' }).some(b => b.from === at('2027-01-12T19:00:00Z'))).toBe(true)
  })

  it('refuses something that is not a calendar', () => {
    expect(() => readCalendar('<html>Sign in</html>', { ...window, tentativeAs: 'maybe' })).toThrow()
  })
})
