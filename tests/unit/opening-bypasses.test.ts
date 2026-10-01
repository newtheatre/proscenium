import { describe, expect, test } from 'bun:test'
import { saysOpeningBypass } from '#shared/utils/season-reports'
import type { OpeningBypassRow } from '#shared/utils/season-reports'

// Issue 1537: a bypass with no performance is said where the committee reads staffing gaps
// (E-130 criterion 6 as amended), and a report with no shifts on the rota says so (E-123 criterion 1).

const REPORTS = 'app/pages/reports/index.vue'
const NIGHT_REPORT = 'app/pages/tonight/report.vue'

const row = (overrides: Partial<OpeningBypassRow> = {}): OpeningBypassRow => ({
  night: '2026-10-17',
  role: 'BAR',
  venueId: 'venue-studio',
  venueName: 'The Studio',
  openingLabel: 'Society social',
  officerName: 'Fen Foh',
  ...overrides,
})

describe('a bypass with no performance, in words (E-130 criterion 6)', () => {
  test('names the officer, the role and the opening it was', () => {
    expect(saysOpeningBypass(row())).toBe('Fen Foh stood in at the bar by officer role: Society social, The Studio')
  })

  test('a bar opened with no opening planned says so rather than naming one', () => {
    expect(saysOpeningBypass(row({ openingLabel: null })))
      .toBe('Fen Foh stood in at the bar by officer role: The Studio, with no bar opening planned')
  })

  test('an officer whose name is gone is still an officer', () => {
    expect(saysOpeningBypass(row({ officerName: null }))).toStartWith('An officer stood in at the bar')
  })
})

describe('the screens carry it (issue 1537)', () => {
  test('the Performances tab reads and lists bypasses with no performance', async () => {
    const source = await Bun.file(REPORTS).text()
    expect(source).toContain('/api/admin/reports/opening-bypasses')
    expect(source).toContain('data-test="opening-bypasses"')
    expect(source).toContain('saysOpeningBypass(')
  })

  test('a night report with no shifts on the rota says so beside its flags', async () => {
    const source = await Bun.file(NIGHT_REPORT).text()
    expect(source).toContain('data-test="staffing-none-stamped"')
    expect(source).toContain('No shifts were on the rota for this performance.')
  })
})
