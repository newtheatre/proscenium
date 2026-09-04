import { describe, expect, test } from 'bun:test'
import { NIGHT_ROLES } from '#shared/utils/night-authority'
import {
  ASSIGNED_SHIFT_STATUSES,
  COMMITTED_SHIFT_STATUSES,
  MAX_SLOT_COUNT,
  SHIFT_CONSTRAINT_REFUSALS,
  SHIFT_ROLES,
  SHIFT_STATUSES,
  orderedSlots,
  shiftConstraintRefusal,
  shiftNamesAPerson,
  shiftTemplateForm,
  stampedSlots,
  templateRefusal,
} from '#shared/utils/rota'
import type { TemplateSlot } from '#shared/utils/rota'

// E-101, E-102 and E-106's pure logic. What the database holds is proved against the real
// migrations in `tests/integration/rota.test.ts`.

const slots = (...pairs: [string, number][]): TemplateSlot[] =>
  pairs.map(([role, count]) => ({ role: role as TemplateSlot['role'], count }))

describe('a shift role is a night role and not a second vocabulary (0044)', () => {
  test('the rota and the night authority name the same three roles', () => {
    expect(SHIFT_ROLES).toEqual(NIGHT_ROLES)
  })
})

describe('every venue template holds exactly one duty manager (E-101 criterion 1)', () => {
  test('a template with one duty manager and other roles is accepted', () => {
    expect(templateRefusal(slots(['DUTY_MANAGER', 1], ['DOOR', 2], ['BAR', 1]))).toBeNull()
  })

  test('a template with no duty manager is refused', () => {
    expect(templateRefusal(slots(['DOOR', 2]))).toContain('duty manager')
  })

  test('a template asking for two duty managers is refused', () => {
    expect(templateRefusal(slots(['DUTY_MANAGER', 2]))).toContain('exactly one')
  })

  test('a role named twice is refused', () => {
    expect(templateRefusal(slots(['DUTY_MANAGER', 1], ['DOOR', 1], ['DOOR', 2]))).toContain('once')
  })

  // Nothing may stamp a template it could not have saved, so an empty list is a venue with no
  // template rather than a template with no slots (E-101 criterion 4).
  test('an empty list is refused as a template', () => {
    expect(templateRefusal([])).not.toBeNull()
  })
})

describe('a template is what a form may send (E-101 criterion 2)', () => {
  test('a count below one is refused', () => {
    expect(shiftTemplateForm.safeParse({ slots: [{ role: 'DOOR', count: 0 }] }).success).toBe(false)
  })

  test('a count past the cap is refused', () => {
    expect(shiftTemplateForm.safeParse({ slots: [{ role: 'DOOR', count: MAX_SLOT_COUNT + 1 }] }).success).toBe(false)
  })

  test('a role outside the three is refused', () => {
    expect(shiftTemplateForm.safeParse({ slots: [{ role: 'USHER', count: 1 }] }).success).toBe(false)
  })

  test('no template may carry more slots than there are roles', () => {
    const tooMany = Array.from({ length: SHIFT_ROLES.length + 1 }, () => ({ role: 'DOOR', count: 1 }))
    expect(shiftTemplateForm.safeParse({ slots: tooMany }).success).toBe(false)
  })
})

describe('a slot is a role and its ordinal (E-102 criterion 2)', () => {
  test('a count of three is three slots numbered from one', () => {
    expect(stampedSlots(slots(['DOOR', 3]))).toEqual([
      { role: 'DOOR', slot: 1 },
      { role: 'DOOR', slot: 2 },
      { role: 'DOOR', slot: 3 },
    ])
  })

  test('each role counts from one again', () => {
    const stamped = stampedSlots(slots(['DUTY_MANAGER', 1], ['BAR', 2]))
    expect(stamped.map(one => `${one.role}:${one.slot}`))
      .toEqual(['DUTY_MANAGER:1', 'BAR:1', 'BAR:2'])
  })

  test('a template with no slots stamps nothing', () => {
    expect(stampedSlots([])).toEqual([])
  })
})

describe('a template reads the same order whatever order it was saved in', () => {
  test('the duty manager comes first', () => {
    expect(orderedSlots(slots(['BAR', 1], ['DOOR', 2], ['DUTY_MANAGER', 1])).map(one => one.role))
      .toEqual(['DUTY_MANAGER', 'DOOR', 'BAR'])
  })
})

describe('an open shift names nobody (E-106 criterion 2)', () => {
  test('open names nobody and every assigned status names somebody', () => {
    expect(shiftNamesAPerson('OPEN')).toBe(false)
    for (const status of ASSIGNED_SHIFT_STATUSES) expect(shiftNamesAPerson(status)).toBe(true)
  })

  // A cancelled shift keeps whoever held it and held nobody when it was open, so it is the one
  // status the CHECK says nothing about.
  test('cancelled says neither', () => {
    expect(shiftNamesAPerson('CANCELLED')).toBeNull()
  })

  test('every status is one of the three answers', () => {
    expect(SHIFT_STATUSES.map(shiftNamesAPerson)).toEqual([false, true, true, true, null])
  })
})

// A cancellation or a venue move has to reckon with a claim awaiting approval the same way it
// reckons with a confirmed one; a decline is excluded because the person is already off the shift.
describe('a person is committed to a shift once claimed, not only once confirmed', () => {
  test('exactly claimed and confirmed, and neither open, declined nor cancelled', () => {
    expect([...COMMITTED_SHIFT_STATUSES].sort()).toEqual(['CLAIMED', 'CONFIRMED'])
  })
})

describe('a constraint violation is a handled refusal (E-106 criterion 3)', () => {
  test('the confirmed duty manager index reads as a 409 a person can act on', () => {
    const refusal = shiftConstraintRefusal(new Error('UNIQUE constraint failed: shifts.performance_id'))
    expect(refusal?.statusCode).toBe(409)
    expect(refusal?.statusMessage).toContain('duty manager')
  })

  test('the open-names-nobody check reads as a 409', () => {
    expect(shiftConstraintRefusal(new Error('CHECK constraint failed: shifts_open_names_nobody'))?.statusCode).toBe(409)
  })

  // D1 wraps the message and appends its own code, and the same failure has to read the same way.
  test('a wrapped message is matched too', () => {
    const wrapped = new Error('D1_ERROR: UNIQUE constraint failed: shifts.performance_id: SQLITE_CONSTRAINT')
    expect(shiftConstraintRefusal(wrapped)?.statusMessage).toContain('duty manager')
  })

  // The slot index names three columns and the duty manager index names one of them, so a
  // substring match would answer the wrong refusal.
  test('the slot index is not read as the duty manager index', () => {
    const taken = new Error('UNIQUE constraint failed: shifts.performance_id, shifts.role, shifts.slot')
    expect(shiftConstraintRefusal(taken)?.statusMessage).toContain('already on the rota')
  })

  // A failure nobody recognised is a defect, and answering 409 would hide it.
  test('anything else is not turned into a refusal', () => {
    expect(shiftConstraintRefusal(new Error('database is locked'))).toBeNull()
  })

  test('every refusal says something a volunteer could act on', () => {
    for (const refusal of SHIFT_CONSTRAINT_REFUSALS) expect(refusal.says.length).toBeGreaterThan(20)
  })

  test('no two refusals answer to the same violation', () => {
    const violated = SHIFT_CONSTRAINT_REFUSALS.map(refusal => refusal.violated)
    expect(violated.length).toBe(new Set(violated).size)
  })
})
