import { describe, expect, test } from 'bun:test'
import { ABILITY_PERMISSIONS, can, recordTrainingByAddress } from '#shared/utils/abilities'
import { PERMISSION_MAP, PROTECTED_ROLE } from '#shared/utils/roles'
import { externalCertificateForm, mayRecordByAddress, recordedFor, signOffForm } from '#shared/utils/training'
import type { Viewer } from '#shared/utils/abilities'
import type { Permission } from '#shared/utils/roles'

// G-130 and 0091: training recorded for an address the picker could not find.

const now = new Date('2026-09-24T12:00:00Z')

describe('who may make the account (criterion 4)', () => {
  test('the Training Manager holds the narrow permission and not accounts.create', () => {
    expect(PERMISSION_MAP.TRAINING_MANAGER).toContain('training.by-address')
    expect(PERMISSION_MAP.TRAINING_MANAGER).not.toContain('accounts.create')
    expect(PERMISSION_MAP[PROTECTED_ROLE]).toContain('training.by-address')
  })

  test('the permission is held by the IT Manager and the Training Manager alone', () => {
    const holders = Object.entries(PERMISSION_MAP)
      .filter(([, permissions]) => permissions.includes('training.by-address'))
      .map(([role]) => role)
      .sort()
    expect(holders).toEqual(['ADMIN', 'TRAINING_MANAGER'])
  })

  const officer = new Set<Permission>(['training.write', 'training.by-address'])
  const manager = new Set<Permission>(['training.write'])
  const nobody = new Set<Permission>()
  const leads = [{ department: 'TECH', expiresAt: null }]

  test('a holder may, for any department', () => {
    expect(mayRecordByAddress(officer, [], 'TECH', now)).toBe(true)
    expect(mayRecordByAddress(officer, [], 'FOH', now)).toBe(true)
  })

  test('a live lead may, for their own department only, holding no role', () => {
    expect(mayRecordByAddress(nobody, leads, 'TECH', now)).toBe(true)
    expect(mayRecordByAddress(nobody, leads, 'FOH', now)).toBe(false)
  })

  test('a lapsed lead may not, with no sweep having run', () => {
    const lapsed = [{ department: 'TECH', expiresAt: Math.floor(Date.parse('2026-07-31T22:59:59Z') / 1000) }]
    expect(mayRecordByAddress(nobody, lapsed, 'TECH', now)).toBe(false)
  })

  test('signing off is not enough on its own', () => {
    expect(mayRecordByAddress(manager, [], 'TECH', now)).toBe(false)
  })

  const viewer = (permissions: Permission[], leadsDepartment: boolean): Viewer => ({
    id: 'v',
    permissions,
    onShiftTonight: false,
    leadsDepartment,
    isTrainer: false,
    membershipState: { kind: 'none' },
  })

  test('the screen offers it to a holder and to a lead, and to nobody else', () => {
    expect(can(viewer(['training.by-address'], false), recordTrainingByAddress)).toBe(true)
    expect(can(viewer([], true), recordTrainingByAddress)).toBe(true)
    expect(can(viewer(['training.write', 'training.read'], false), recordTrainingByAddress)).toBe(false)
    expect(ABILITY_PERMISSIONS.recordTrainingByAddress).toBe('training.by-address')
  })
})

describe('an account is chosen, or an address and a name are given (criteria 1 and 2)', () => {
  const signOff = { moduleId: 'TECH-111', awardedOn: '2026-09-20' }
  const certificate = { ...signOff, expiresOn: '2029-09-20', evidenceRef: 'IPAF 3a, certificate 44821' }

  for (const [form, body] of [[signOffForm, signOff], [externalCertificateForm, certificate]] as const) {
    test('either one, never both and never neither', () => {
      expect(form.safeParse({ ...body, userId: 'u1' }).success).toBe(true)
      expect(form.safeParse({ ...body, email: 'fresher@example.test', name: 'Fresh Fresher' }).success).toBe(true)
      expect(form.safeParse(body).success).toBe(false)
      expect(form.safeParse({ ...body, userId: 'u1', email: 'fresher@example.test', name: 'Fresh Fresher' }).success).toBe(false)
    })

    test('an address needs a name, and has to be an address', () => {
      expect(form.safeParse({ ...body, email: 'fresher@example.test' }).success).toBe(false)
      expect(form.safeParse({ ...body, email: 'fresher@example.test', name: '   ' }).success).toBe(false)
      expect(form.safeParse({ ...body, email: 'not an address', name: 'Fresh Fresher' }).success).toBe(false)
    })
  }

  test('the address is normalised, so the unique index compares like with like', () => {
    const parsed = signOffForm.parse({ ...signOff, email: '  Fresher@Example.TEST ', name: ' Fresh Fresher ' })
    expect(recordedFor(parsed)).toEqual({ email: 'fresher@example.test', name: 'Fresh Fresher' })
    expect(recordedFor(signOffForm.parse({ ...signOff, userId: 'u1' }))).toBeNull()
  })
})
