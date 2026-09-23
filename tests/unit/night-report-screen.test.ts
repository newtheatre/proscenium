import { describe, expect, test } from 'bun:test'
import { OFFICER_SIGN_OFF_NOTICE, saysSignedOff, tenderTotalPence } from '#shared/utils/night-signoff'

// The duty manager's own sign-off screen (E-124 criteria 1 and 2, E-123 criterion 4, issue 1053):
// the route existed with no caller, so every night closed itself with nobody's name on it.

const PAGE = 'app/pages/tonight/report.vue'
const HUB = 'app/pages/tonight/index.vue'

describe('who closed the night, in words (E-124 criterion 2, 0044)', () => {
  test('a duty manager on shift is named plainly', () => {
    expect(saysSignedOff('Ada Lovelace', 'SHIFT')).toBe('Signed off by Ada Lovelace.')
  })

  test('an officer standing in is flagged as such', () => {
    expect(saysSignedOff('Ada Lovelace', 'OFFICER')).toBe('Signed off by Ada Lovelace, standing in with no duty manager shift.')
  })

  test('an automatic close names nobody', () => {
    expect(saysSignedOff(null, 'SYSTEM')).toBe('Closed automatically, with nobody signing.')
  })

  test('the officer is told before signing that it is recorded', () => {
    expect(OFFICER_SIGN_OFF_NOTICE).toContain('standing in for the duty manager')
  })
})

describe('a takings line is the sum of its tenders', () => {
  test('in pence, with nothing sold reading nought', () => {
    expect(tenderTotalPence([{ totalPence: 1250 }, { totalPence: 800 }])).toBe(2050)
    expect(tenderTotalPence([])).toBe(0)
  })
})

describe('the report screen (issue 1053)', () => {
  test('wears the tonight layout and names its documentation page', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('layout: \'tonight\'')
    expect(source).toContain('docs: \'/docs/tonight/night-report\'')
  })

  test('reads the live draft and posts the closing note to sign-off', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('\'/api/tonight/report\'')
    expect(source).toContain('\'/api/tonight/report/sign-off\'')
    expect(source).toContain('closingNote')
  })

  test('is a tile on the hub, carrying the performance the hub is showing', async () => {
    const source = await Bun.file(HUB).text()
    expect(source).toContain('scoped(\'/tonight/report\')')
    expect(source).toContain('data-test="tile-report"')
  })
})

describe('the officer warning and the switcher read the performance on screen (0044)', () => {
  test('authority is asked for the performance being signed off, and again on a switch', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('{ role: \'DUTY_MANAGER\', performanceId: asked }')
    expect(source).toMatch(/function choose\(chosen: string\): void \{[^}]*loadAuthority\(\)/)
  })

  test('a refusal with no house to choose is shown rather than an empty switcher', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('v-if="ambiguous && choices.length > 0"')
  })

  test('the bypass is said once for the night, never beside a named slot', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).not.toContain('v-if="row.officerBypass"')
    expect(source).toContain('data-test="staffing-officer-bypass"')
  })
})
