import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS } from '#shared/utils/config'
import { saysReportFigures } from '#shared/utils/night-signoff'

// The signed-off email says what happened and reaches the night's officers on a fresh install (0239).

describe('the night report email (0239)', () => {
  test('leads with the night\'s figures, money as pounds', () => {
    expect(saysReportFigures({ sold: 40, admitted: 37, noShows: 3, incidents: 1, boxOfficePence: 12050, barPence: 0 })).toEqual([
      'Sold: 40 seats',
      'In: 37 seats',
      'No-shows: 3 seats',
      'Incidents logged: 1',
      'Box office: £120.50',
      'Bar: £0.00',
    ])
  })

  test('goes to the Front of House Manager and the Theatre Manager until the workshop says otherwise', () => {
    expect(CONFIG_KEYS.NIGHT_REPORT_ROLES.default).toEqual(['FOH_MANAGER', 'THEATRE_MANAGER'])
  })
})
