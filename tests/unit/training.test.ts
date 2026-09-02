import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS } from '#shared/utils/config'
import { isMonthDay, nextCommitteeYearEnd } from '#shared/utils/london'
import {
  MAX_EXPIRY_MONTHS,
  RECORD_SOURCES,
  academicYearEnd,
  addMonths,
  countsAsHeld,
  daysBetween,
  describeExpiry,
  exceedsExpiryCap,
  expiryFor,
  expiryProblem,
  externalCertificateForm,
  externalExpiryProblem,
  frozenChanges,
  isLeadLive,
  leadsDepartment,
  moduleForm,
  newModuleForm,
  saysFrozenChange,
  saysSource,
  saysState,
  stateOf,
  supersededIn,
} from '#shared/utils/training'

// The catalogue's pure half. Validity is derived from dates every time it is read, so there is no
// state here to assert, only arithmetic and refusals (0018, G-107, G-110, G-123).

// A stated boundary rather than the configured one. These cases pin the arithmetic, and the
// committee moving the boundary is a settings change that must not break a release (0012).
const YEAR = { boundary: '08-31', carryOverDays: 60 }

const MODULE = {
  department: 'TECH',
  kind: 'MODULE' as const,
  name: 'Working at height',
  deliveryMode: 'IN_PERSON' as const,
  expiryMode: 'NONE' as const,
  materials: [],
}

describe('an expiry mode is never, a number of months, or the academic year (G-123 criterion 1)', () => {
  test('never expires stamps no date at all', () => {
    expect(expiryFor({ expiryMode: 'NONE', expiryMonths: null }, '2026-09-14', YEAR)).toBeNull()
  })

  test('a months policy counts from the award', () => {
    expect(expiryFor({ expiryMode: 'MONTHS', expiryMonths: 24 }, '2026-09-14', YEAR)).toBe('2028-09-14')
  })

  test('an academic-year policy lands on the configured boundary', () => {
    expect(expiryFor({ expiryMode: 'ACADEMIC_YEAR', expiryMonths: null }, '2026-09-14', YEAR)).toBe('2027-08-31')
  })

  // The boundary is configuration, so moving it moves the answer and nothing else (0012).
  test('the boundary is read from configuration, not from the committee year', () => {
    const july = { boundary: '07-31', carryOverDays: 60 }
    expect(academicYearEnd('2026-09-14', july)).toBe('2027-07-31')
  })

  test('a day the award has but the target month does not falls back to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2027-12-31', 2)).toBe('2028-02-29')
  })
})

describe('a late award carries over rather than expiring in weeks (G-123 criterion 2)', () => {
  test('an award the day before the boundary is worth the following year', () => {
    expect(academicYearEnd('2026-08-30', YEAR)).toBe('2027-08-31')
  })

  test('an award on the boundary itself is worth the following year, never nothing', () => {
    expect(academicYearEnd('2026-08-31', YEAR)).toBe('2027-08-31')
  })

  // Read inclusively: an award exactly the carry-over window out is "within" it. The window is
  // configuration, so the reading is what this pins, not the number.
  test('an award exactly the carry-over window out still carries', () => {
    expect(daysBetween('2026-07-02', '2026-08-31')).toBe(60)
    expect(academicYearEnd('2026-07-02', YEAR)).toBe('2027-08-31')
  })

  test('an award a day outside the window keeps the nearer boundary', () => {
    expect(daysBetween('2026-07-01', '2026-08-31')).toBe(61)
    expect(academicYearEnd('2026-07-01', YEAR)).toBe('2026-08-31')
  })

  test('an award early in the year is not carried', () => {
    expect(academicYearEnd('2026-01-15', YEAR)).toBe('2026-08-31')
  })
})

describe('a lifetime is capped (G-123 criterion 4)', () => {
  test('a policy beyond the cap is refused by the form', () => {
    const refused = moduleForm.safeParse({ ...MODULE, expiryMode: 'MONTHS', expiryMonths: MAX_EXPIRY_MONTHS + 1 })
    expect(refused.success).toBe(false)
  })

  test('a policy at the cap is allowed', () => {
    const allowed = moduleForm.safeParse({ ...MODULE, expiryMode: 'MONTHS', expiryMonths: MAX_EXPIRY_MONTHS })
    expect(allowed.success).toBe(true)
  })

  test('an explicit expiry beyond the cap is over it too', () => {
    expect(exceedsExpiryCap('2026-09-14', '2036-09-14')).toBe(false)
    expect(exceedsExpiryCap('2026-09-14', '2036-09-15')).toBe(true)
  })
})

describe('an impossible year boundary is refused (G-123 criterion 5)', () => {
  test('a day that exists in every year is a boundary', () => {
    expect(isMonthDay('08-31')).toBe(true)
    expect(isMonthDay('02-28')).toBe(true)
  })

  // A date that parses as NaN would read as valid forever, which is the whole reason for the rule.
  test('the twenty-ninth of February is not, because three years in four do not have one', () => {
    expect(isMonthDay('02-29')).toBe(false)
  })

  test('a month or a day that does not exist is not', () => {
    expect(isMonthDay('13-01')).toBe(false)
    expect(isMonthDay('04-31')).toBe(false)
    expect(isMonthDay('00-10')).toBe(false)
    expect(isMonthDay('8-31')).toBe(false)
  })

  test('the computation refuses one rather than stamping a date nobody can reach', () => {
    expect(() => academicYearEnd('2026-09-14', { boundary: '02-29', carryOverDays: 60 })).toThrow()
  })
})

describe('the shipped boundary is the one the catalogue expects', () => {
  const shipped = {
    boundary: CONFIG_KEYS.ACADEMIC_YEAR_BOUNDARY.default,
    carryOverDays: CONFIG_KEYS.TRAINING_CARRY_OVER_DAYS.default,
  }

  // The committee's catalogue defines an academic-year expiry as 30 September, and seven of its
  // modules use one. A default that disagreed would date every such record a month early.
  test('an academic year ends on the thirtieth of September', () => {
    expect(shipped.boundary).toBe('09-30')
  })

  test('an award early in the year runs to the end of the one it falls in', () => {
    expect(academicYearEnd('2026-10-15', shipped)).toBe('2027-09-30')
  })

  // The whole point of the carry-over: an induction taken in the week term starts is worth the
  // year it starts, not the fortnight left of the year before.
  test('an award just before the boundary is worth the following year', () => {
    expect(academicYearEnd('2026-09-20', shipped)).toBe('2027-09-30')
  })
})

describe('a mode the computation does not know is refused, never defaulted', () => {
  // The trap this closes: a fourth mode added to the enum and the CHECK but not here would stamp
  // an academic year onto every record on it, and G-124 would be the only way back.
  test('an unknown expiry mode throws rather than falling through to the academic year', () => {
    const rogue = { expiryMode: 'FIXED_DATE', expiryMonths: null } as unknown as Parameters<typeof expiryFor>[0]
    expect(() => expiryFor(rogue, '2026-09-14', YEAR)).toThrow()
  })

  test('a months policy with no months throws rather than expiring on the award day', () => {
    const broken = { expiryMode: 'MONTHS', expiryMonths: null } as Parameters<typeof expiryFor>[0]
    expect(() => expiryFor(broken, '2026-09-14', YEAR)).toThrow()
  })
})

describe('a module carries its kind, mode and materials (G-107 criteria 1 and 2)', () => {
  test('an id is the published human one, and it is checked', () => {
    expect(newModuleForm.safeParse({ ...MODULE, id: 'TECH-111' }).success).toBe(true)
    expect(newModuleForm.safeParse({ ...MODULE, id: 'tech 111' }).success).toBe(false)
  })

  test('a safety-critical module cannot be fully self-directed', () => {
    const refused = moduleForm.safeParse({ ...MODULE, safetyCritical: true, deliveryMode: 'SELF_DIRECTED' })
    expect(refused.success).toBe(false)
    expect(refused.error?.issues[0]?.path).toEqual(['deliveryMode'])
  })

  test('a safety-critical module may still be hybrid, where the assessment is in person', () => {
    expect(moduleForm.safeParse({ ...MODULE, safetyCritical: true, deliveryMode: 'HYBRID' }).success).toBe(true)
  })

  test('a material link is an address a browser will navigate to', () => {
    const materials = [{ label: 'The manual', url: 'https://example.invalid/manual' }]
    expect(moduleForm.safeParse({ ...MODULE, materials }).success).toBe(true)
    expect(moduleForm.safeParse({ ...MODULE, materials: [{ label: 'Bad', url: 'javascript:alert(1)' }] }).success)
      .toBe(false)
  })

  test('a months policy with no months, and months with no policy, are both refused', () => {
    expect(moduleForm.safeParse({ ...MODULE, expiryMode: 'MONTHS' }).success).toBe(false)
    expect(moduleForm.safeParse({ ...MODULE, expiryMode: 'NONE', expiryMonths: 12 }).success).toBe(false)
  })
})

describe('a brief is taught once and grants nothing (G-107 criterion 4, G-123 criterion 6)', () => {
  const BRIEF = { ...MODULE, kind: 'BRIEF' as const }

  test('a brief cannot carry an expiry policy', () => {
    expect(moduleForm.safeParse({ ...BRIEF, expiryMode: 'ACADEMIC_YEAR' }).success).toBe(false)
    expect(moduleForm.safeParse({ ...BRIEF, expiryMode: 'MONTHS', expiryMonths: 12 }).success).toBe(false)
  })

  test('a brief cannot grant trainer or supervisor standing', () => {
    expect(moduleForm.safeParse({ ...BRIEF, grantsTrainer: true }).success).toBe(false)
    expect(moduleForm.safeParse({ ...BRIEF, grantsSupervisor: true }).success).toBe(false)
  })

  test('a certification can, which is what trainer standing derives from', () => {
    expect(moduleForm.safeParse({ ...MODULE, kind: 'CERTIFICATION', grantsTrainer: true }).success).toBe(true)
  })

  test('only a brief is self-registrable', () => {
    expect(moduleForm.safeParse({ ...BRIEF, selfRegistrable: true }).success).toBe(true)
    expect(moduleForm.safeParse({ ...MODULE, selfRegistrable: true }).success).toBe(false)
  })
})

describe('a module says what its lifetime means', () => {
  test('each policy reads as a sentence rather than as a mode', () => {
    expect(describeExpiry({ expiryMode: 'NONE', expiryMonths: null })).toBe('Never expires')
    expect(describeExpiry({ expiryMode: 'MONTHS', expiryMonths: 24 })).toBe('24 months from award')
    expect(describeExpiry({ expiryMode: 'ACADEMIC_YEAR', expiryMonths: null })).toBe('Ends with the academic year')
  })
})

describe('lead standing is read live (G-110 criteria 2, 3 and 4)', () => {
  const now = new Date('2026-09-01T12:00:00Z')
  const seconds = (at: string): number => Math.floor(new Date(at).getTime() / 1000)

  test('a person may lead more than one department', () => {
    const leads = [
      { department: 'TECH', expiresAt: null },
      { department: 'BACKSTAGE', expiresAt: null },
    ]
    expect(leadsDepartment(leads, 'TECH', now)).toBe(true)
    expect(leadsDepartment(leads, 'BACKSTAGE', now)).toBe(true)
  })

  test('leading one department confers nothing over another', () => {
    expect(leadsDepartment([{ department: 'TECH', expiresAt: null }], 'BACKSTAGE', now)).toBe(false)
  })

  test('an assignment that lapsed confers nothing, with no sweep having run', () => {
    const lapsed = { department: 'TECH', expiresAt: seconds('2026-07-31T22:59:59Z') }
    expect(isLeadLive(lapsed, now)).toBe(false)
    expect(leadsDepartment([lapsed], 'TECH', now)).toBe(false)
  })

  test('an assignment still running confers standing', () => {
    const live = { department: 'TECH', expiresAt: seconds('2027-07-31T22:59:59Z') }
    expect(isLeadLive(live, now)).toBe(true)
  })

  // Criterion 3: the platform role model's handover date, not a training one of its own (0009).
  test('the default expiry is the next handover', () => {
    expect(nextCommitteeYearEnd(now).toISOString()).toBe('2027-07-31T22:59:59.999Z')
  })
})

describe('a record\'s validity is derived from its dates (G-101 criteria 1 to 5)', () => {
  const WARNING = CONFIG_KEYS.TRAINING_EXPIRY_WARNING_DAYS.default

  test('a record with no expiry is always valid, which is what a brief holds (criterion 5)', () => {
    expect(stateOf(null, '2026-09-14', WARNING)).toBe('VALID')
    expect(stateOf(null, '2099-01-01', WARNING)).toBe('VALID')
  })

  // Criterion 2, and the one that decides whether somebody works a shift on the day.
  test('a record expires on its expiry date, not after it', () => {
    expect(stateOf('2026-09-14', '2026-09-13', WARNING)).toBe('EXPIRING')
    expect(stateOf('2026-09-14', '2026-09-14', WARNING)).toBe('EXPIRED')
    expect(stateOf('2026-09-14', '2026-09-15', WARNING)).toBe('EXPIRED')
  })

  test('the warning window is where expiring begins (criterion 4)', () => {
    expect(stateOf('2027-01-01', '2026-12-01', WARNING)).toBe('EXPIRING')
    expect(stateOf('2027-01-01', '2026-01-01', WARNING)).toBe('VALID')
  })

  test('the boundary of the window is inclusive, and a day outside it is not', () => {
    const expires = '2027-01-01'
    const onTheEdge = '2026-11-02'
    expect(daysBetween(onTheEdge, expires)).toBe(WARNING)
    expect(stateOf(expires, onTheEdge, WARNING)).toBe('EXPIRING')
    expect(stateOf(expires, '2026-11-01', WARNING)).toBe('VALID')
  })

  // Criterion 3. This is the property every gate in the system leans on.
  test('expiring counts as held, and expired does not', () => {
    expect(countsAsHeld('VALID')).toBe(true)
    expect(countsAsHeld('EXPIRING')).toBe(true)
    expect(countsAsHeld('EXPIRED')).toBe(false)
  })

  test('each state reads as a word rather than as a token', () => {
    expect(saysState('VALID')).toBe('Valid')
    expect(saysState('EXPIRING')).toBe('Renew soon')
    expect(saysState('EXPIRED')).toBe('Expired')
  })
})

describe('which record is current is derived too (G-101 criterion 6, G-120 criterion 6)', () => {
  const record = (id: string, moduleId: string, awardedOn: string, createdAt = 1) =>
    ({ id, moduleId, awardedOn, createdAt })

  test('nothing is superseded when a person holds one record per module', () => {
    expect(supersededIn([record('a', 'TECH-111', '2026-09-14'), record('b', 'FOH-101', '2026-09-14')]).size).toBe(0)
  })

  test('a renewal supersedes the award it renews', () => {
    const superseded = supersededIn([
      record('old', 'TECH-111', '2025-09-14'),
      record('new', 'TECH-111', '2026-09-14'),
    ])
    expect([...superseded]).toEqual(['old'])
  })

  // An award date is a London day, so two awards can share one and the tie needs breaking on
  // something monotonic rather than left to whichever row came back first.
  test('two awards on one day break the tie on when they were written', () => {
    const superseded = supersededIn([
      record('first', 'TECH-111', '2026-09-14', 1000),
      record('second', 'TECH-111', '2026-09-14', 2000),
    ])
    expect([...superseded]).toEqual(['first'])
  })

  test('supersession is per module, so a renewal of one leaves the other alone', () => {
    const superseded = supersededIn([
      record('tech-old', 'TECH-111', '2025-09-14'),
      record('tech-new', 'TECH-111', '2026-09-14'),
      record('foh', 'FOH-101', '2024-01-01'),
    ])
    expect([...superseded]).toEqual(['tech-old'])
  })
})

describe('a module\'s safety semantics are compared field by field (G-109 criteria 1 and 2)', () => {
  const HELD = { kind: 'MODULE', grantsTrainer: false, grantsSupervisor: false }

  test('an edit that leaves the three alone changes nothing frozen', () => {
    expect(frozenChanges(HELD, { ...HELD })).toEqual([])
  })

  test('a kind change is frozen (criterion 1)', () => {
    expect(frozenChanges(HELD, { ...HELD, kind: 'CERTIFICATION' })).toEqual(['kind'])
  })

  test('the granting flags are frozen the same way (criterion 2)', () => {
    expect(frozenChanges(HELD, { ...HELD, grantsTrainer: true })).toEqual(['grantsTrainer'])
    expect(frozenChanges(HELD, { ...HELD, grantsSupervisor: true })).toEqual(['grantsSupervisor'])
    expect(frozenChanges({ ...HELD, grantsTrainer: true }, HELD)).toEqual(['grantsTrainer'])
  })

  test('every other field on the form is editable while records exist', () => {
    expect(frozenChanges(HELD, { ...HELD, name: 'Renamed', safetyCritical: true } as typeof HELD)).toEqual([])
  })

  test('the refusal names each frozen field and says to retire and recreate (criterion 1)', () => {
    const said = saysFrozenChange(['kind']).toLowerCase()
    expect(said).toContain('kind')
    expect(said).toContain('retire')
    expect(saysFrozenChange(['grantsTrainer', 'grantsSupervisor'])).toContain('supervisor')
  })
})

describe('an external certificate is recorded, never assessed (G-121)', () => {
  const body = {
    userId: 'u1',
    moduleId: 'TECH-111',
    awardedOn: '2026-09-14',
    expiresOn: '2029-09-14',
    evidenceRef: 'IPAF 3a, certificate 44821',
  }

  // Criterion 2. The reference is the whole of what we trust in place of having assessed it.
  test('an evidence reference is mandatory', () => {
    expect(externalCertificateForm.safeParse(body).success).toBe(true)
    expect(externalCertificateForm.safeParse({ ...body, evidenceRef: undefined }).success).toBe(false)
    expect(externalCertificateForm.safeParse({ ...body, evidenceRef: null }).success).toBe(false)
    expect(externalCertificateForm.safeParse({ ...body, evidenceRef: '   ' }).success).toBe(false)
  })

  // Criterion 3. No shape of this body inherits the module's policy, and none of them means never.
  test('an explicit expiry is mandatory, and never is not on offer', () => {
    expect(externalCertificateForm.safeParse({ ...body, expiresOn: undefined }).success).toBe(false)
    expect(externalCertificateForm.safeParse({ ...body, expiresOn: null }).success).toBe(false)
    expect(externalCertificateForm.safeParse({ ...body, expiresOn: '14/09/2029' }).success).toBe(false)
  })

  test('an expiry on or before the award is refused', () => {
    expect(externalExpiryProblem('2026-09-14', '2026-09-14')).toBeTruthy()
    expect(externalExpiryProblem('2026-09-14', '2026-09-13')).toBeTruthy()
  })

  test('the catalogue-wide cap binds it', () => {
    expect(externalExpiryProblem('2026-09-14', addMonths('2026-09-14', MAX_EXPIRY_MONTHS))).toBeNull()
    expect(externalExpiryProblem('2026-09-14', addMonths('2026-09-14', MAX_EXPIRY_MONTHS + 1)))
      .toContain(String(MAX_EXPIRY_MONTHS))
  })

  // The issuing body set the term, so a house policy of twelve months does not shorten a
  // three-year ticket: the module's policy is exactly what is never inherited (criterion 3).
  test('the module policy does not bind it, where a sign-off would be refused', () => {
    const policy = { expiryMode: 'MONTHS' as const, expiryMonths: 12 }
    expect(expiryProblem(policy, '2026-09-14', '2029-09-14')).toBeTruthy()
    expect(externalExpiryProblem('2026-09-14', '2029-09-14')).toBeNull()
  })

  // Criterion 4. Every view says how a record was come by, and no two sources read alike.
  test('each source reads as words, and external says so', () => {
    const said = RECORD_SOURCES.map(source => saysSource(source))
    expect(saysSource('EXTERNAL')).toBe('External certificate')
    expect(saysSource('SIGNOFF')).not.toBe(saysSource('EXTERNAL'))
    expect(new Set(said).size).toBe(RECORD_SOURCES.length)
  })
})
