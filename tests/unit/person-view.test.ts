import { describe, expect, test } from 'bun:test'
import { saysPersonStaffing, staffingFixes, staffingStanding } from '#shared/utils/person-view'
import type { RoleEligibility } from '#shared/utils/rota-readiness'

// 0255: what the account page says each person can staff, from the facts the write reads.
const bar: RoleEligibility = { role: 'BAR', moduleId: 'BAR1', moduleName: 'Bar basics', standing: 'SET' }
const duty: RoleEligibility = { role: 'DUTY_MANAGER', moduleId: 'DM1', moduleName: 'Duty manager', standing: 'SET' }

describe('a role is open to a person exactly when its gate would admit them (0255)', () => {
  test('a role with no committee need turns only on the module', () => {
    expect(staffingStanding(bar, true, false, false)).toBe('CAN_STAFF')
    expect(staffingStanding(bar, false, true, false)).toBe('NO_MODULE')
  })

  test('a duty manager role needs the module and a committee role, and names whichever is missing', () => {
    expect(staffingStanding(duty, true, true, false)).toBe('CAN_STAFF')
    expect(staffingStanding(duty, true, false, false)).toBe('NO_COMMITTEE_ROLE')
    expect(staffingStanding(duty, false, true, false)).toBe('NO_MODULE')
    expect(staffingStanding(duty, false, false, false)).toBe('NEITHER')
  })

  test('a role nobody can take is not open, but a retired module still admits whoever holds it', () => {
    expect(staffingStanding({ ...bar, moduleId: null, standing: 'UNSET' }, false, false, false)).toBe('NOT_OPEN')
    expect(staffingStanding({ ...bar, standing: 'MISSING' }, true, false, false)).toBe('NOT_OPEN')
    expect(staffingStanding({ ...bar, standing: 'DRAFT' }, false, false, false)).toBe('NOT_OPEN')
    expect(staffingStanding({ ...bar, standing: 'RETIRED' }, true, false, false)).toBe('CAN_STAFF')
    expect(staffingStanding({ ...bar, standing: 'RETIRED' }, false, false, false)).toBe('NOT_OPEN')
  })

  test('a disabled account takes no shift whatever it holds', () => {
    expect(staffingStanding(duty, true, true, true)).toBe('DISABLED')
  })
})

describe('each gap says what is missing and points at its fix (0255)', () => {
  const line = (eligibility: RoleEligibility, holdsModule: boolean, holdsCommitteeRole: boolean) =>
    ({ ...eligibility, holdsModule, holdsCommitteeRole, staffing: staffingStanding(eligibility, holdsModule, holdsCommitteeRole, false) })

  test('the sentences name the module and the shift', () => {
    expect(saysPersonStaffing(line(bar, true, false))).toBe('Can take a bar shift.')
    expect(saysPersonStaffing(line(bar, false, false))).toBe('Needs Bar basics (BAR1) to take a bar shift.')
    expect(saysPersonStaffing(line(duty, true, false))).toBe('Holds Duty manager (DM1), but a duty manager shift also needs a committee role.')
    expect(saysPersonStaffing(line(duty, false, false))).toBe('Needs Duty manager (DM1) and a committee role to take a duty manager shift.')
  })

  test('a gap points at training, roles or the templates, and a role that can be staffed at nothing', () => {
    expect(staffingFixes('NO_MODULE')).toEqual(['TRAINING'])
    expect(staffingFixes('NO_COMMITTEE_ROLE')).toEqual(['ROLES'])
    expect(staffingFixes('NEITHER')).toEqual(['TRAINING', 'ROLES'])
    expect(staffingFixes('NOT_OPEN')).toEqual(['TEMPLATES'])
    expect(staffingFixes('CAN_STAFF')).toEqual([])
    expect(staffingFixes('DISABLED')).toEqual([])
  })
})
