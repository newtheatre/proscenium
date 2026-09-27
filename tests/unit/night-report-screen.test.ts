import { describe, expect, test } from 'bun:test'
import {
  OFFICER_SIGN_OFF_NOTICE,
  holdsTheClose,
  nightSignOffForm,
  openAtClose,
  saysIncidentsMoved,
  saysSignOffOpens,
  saysSignedOff,
  tenderTotalPence,
} from '#shared/utils/night-signoff'
import type { Phase, SystemCheck } from '#shared/utils/checklist'

// The duty manager's own sign-off screen (E-124 criteria 1 and 2, E-123 criterion 4, issue 1053):
// the route existed with no caller, so every night closed itself with nobody's name on it.

const PAGE = 'app/pages/tonight/report.vue'
const HUB = 'app/pages/tonight/index.vue'
const GLANCE = 'app/pages/tonight/glance.vue'
const CHECKLIST = 'app/pages/tonight/checklist/index.vue'
const ROWS = 'app/components/NightChecklistItems.vue'

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

  // Issue 1315: the sign-off reviews the incidents the screen listed, and no others.
  test('sends back how many incidents the report it showed listed', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('incidentsSeen: report.value')
  })

  test('is a tile on the hub, carrying the performance the hub is showing', async () => {
    const source = await Bun.file(HUB).text()
    // Drawn from the hub's tile table since issue 1304, still scoped to the house on screen.
    expect(source).toContain('to: \'/tonight/report\', scoped: true')
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

  // 0098: every role an officer stood in for, each said in words, not the duty manager's alone.
  test('each role an officer stood in for is its own line', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('in report.bypasses"')
    expect(source).toContain('saysOfficerBypass(bypass)')
  })

  test('a report frozen before 0098 still shows its duty manager flag', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('report.staffing.some(row => row.officerBypass)')
    expect(source).toContain('An officer opened the duty manager\'s screens without the shift')
  })
})

const entry = (overrides: Partial<{ phase: Phase, required: boolean, done: boolean, systemCheck: SystemCheck | null }> = {}): { phase: Phase, required: boolean, done: boolean, systemCheck: SystemCheck | null } =>
  ({ phase: 'POST', required: true, done: false, systemCheck: null, ...overrides })

// Issue 1315: one Sign off and close answers the checklist, the incidents and the freeze.
describe('what holds Sign off and close (E-114 criteria 3 and 4, E-124 criterion 1)', () => {
  test('a required item neither ticked nor an exception holds it, in either phase', () => {
    expect(holdsTheClose(entry())).toBe(true)
    expect(holdsTheClose(entry({ phase: 'PRE' }))).toBe(true)
    expect(holdsTheClose(entry({ done: true }))).toBe(false)
    expect(holdsTheClose(entry({ required: false }))).toBe(false)
  })

  test('tonight\'s incidents never hold it: the sign-off reviews them itself', () => {
    expect(holdsTheClose(entry({ systemCheck: 'INCIDENTS_REVIEWED' }))).toBe(false)
    expect(holdsTheClose(entry({ systemCheck: 'NO_SHOW_HOLDS_RELEASED' }))).toBe(true)
  })

  test('the report lists every open post-show item and any required pre-show one, never the incidents item', () => {
    const listed = openAtClose([
      entry({ phase: 'PRE', required: false }),
      entry({ phase: 'PRE' }),
      entry({ phase: 'POST', required: false }),
      entry({ phase: 'POST', done: true }),
      entry({ phase: 'POST', systemCheck: 'INCIDENTS_REVIEWED' }),
    ])
    expect(listed).toEqual([entry({ phase: 'PRE' }), entry({ phase: 'POST', required: false })])
  })
})

describe('the sign-off says what moved under it (issue 1315)', () => {
  test('an incident logged after the report was opened is counted', () => {
    expect(saysIncidentsMoved(0, 1)).toBe('1 incident logged since you opened the report: read it again and sign off')
    expect(saysIncidentsMoved(1, 3)).toBe('2 incidents logged since you opened the report: read it again and sign off')
  })

  test('any other mismatch still sends the duty manager back to read it', () => {
    expect(saysIncidentsMoved(4, 3)).toBe('The report has changed since you opened it: read it again and sign off')
  })

  test('before the curtain the screen says when the sign-off opens', () => {
    // 22:10 on Thursday 5 November 2026, in London.
    expect(saysSignOffOpens(1793916600)).toBe('Sign off and close opens at 22:10, once the curtain is down.')
  })

  test('the form carries the count it was shown, and refuses without one', () => {
    expect(nightSignOffForm.safeParse({ closingNote: 'Quiet', incidentsSeen: 2 }).success).toBe(true)
    expect(nightSignOffForm.safeParse({ closingNote: 'Quiet' }).success).toBe(false)
    expect(nightSignOffForm.safeParse({ closingNote: 'Quiet', incidentsSeen: -1 }).success).toBe(false)
  })
})

describe('nothing final is pinned before the curtain (issue 1315)', () => {
  test('the report pins Sign off and close only once the curtain is down', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('label="Sign off and close"')
    expect(source).toMatch(/v-if="report && !signedOff && curtainDown"\s+#actions/)
    expect(source).not.toContain('Open the checklist')
  })

  test('the report puts the open items in place, with Tick', async () => {
    const source = await Bun.file(PAGE).text()
    expect(source).toContain('<NightChecklistItems')
    expect(source).toContain('openAtClose(report.checklist)')
  })

  test('the glance pins Night report after the curtain, and never Close the night', async () => {
    const source = await Bun.file(GLANCE).text()
    expect(source).toContain('label="Night report"')
    expect(source).toContain('v-if="dutyManager && curtainDown"')
    expect(source).not.toContain('Close the night')
  })

  test('the checklist pins nothing and has no close of its own', async () => {
    const source = await Bun.file(CHECKLIST).text()
    expect(source).not.toContain('<NightAction')
    expect(source).not.toContain('/api/tonight/checklist/close')
    expect(await Bun.file('server/api/tonight/checklist/close.post.ts').exists()).toBe(false)
  })

  test('the hub hands the curtain to the tiles', async () => {
    const source = await Bun.file(HUB).text()
    expect(source).toContain('hubTiles(authority.value.known ? authority.value.roles : null, curtainDown.value)')
  })

  test('an exception is a quiet Can\'t do this? line, never a second button beside Tick', async () => {
    const source = await Bun.file(ROWS).text()
    expect(source).toContain('Can\'t do this?')
    expect(source).toContain('variant="link"')
    expect(source).not.toContain('Make an exception')
  })
})
