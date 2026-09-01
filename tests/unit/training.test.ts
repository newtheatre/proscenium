import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS } from '#shared/utils/config'
import { isMonthDay, nextCommitteeYearEnd } from '#shared/utils/london'
import {
  MAX_EXPIRY_MONTHS,
  academicYearEnd,
  addMonths,
  daysBetween,
  describeExpiry,
  exceedsExpiryCap,
  expiryFor,
  isLeadLive,
  leadsDepartment,
  moduleForm,
  newModuleForm,
} from '#shared/utils/training'

// The catalogue's pure half. Validity is derived from dates every time it is read, so there is no
// state here to assert, only arithmetic and refusals (0018, G-107, G-110, G-123).

// Read from the register rather than restated, so moving a default moves these cases with it and
// a test cannot go on claiming a number nobody ships (0012).
const YEAR = {
  boundary: CONFIG_KEYS.ACADEMIC_YEAR_BOUNDARY.default,
  carryOverDays: CONFIG_KEYS.TRAINING_CARRY_OVER_DAYS.default,
}

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
