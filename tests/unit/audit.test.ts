import { describe, expect, test } from 'bun:test'
import { MAX_DETAIL_STRING, auditEntry, changes } from '#shared/utils/audit'
import { AUDIT_ACTIONS, AUDIT_ACTION_NAMES, AUDIT_MODULES, MANUAL_ACTION_NAMES, auditAction, describeAction, isManualAction } from '#shared/utils/audit-actions'
import { AUDIT_COVERAGE } from '#shared/utils/audit-coverage'

const ok = { actorId: 'u-1', action: 'role.granted', target: 'user:u-2' }

describe('audit entries (0010, 0011)', () => {
  test('a well-formed entry carries an id and its parts', () => {
    const entry = auditEntry({ ...ok, detail: { role: 'ADMINISTRATOR' } })
    expect(entry.id).toMatch(/^[0-9a-z]{8,}$/i)
    expect(entry).toMatchObject({ actorId: 'u-1', action: 'role.granted', target: 'user:u-2' })
    expect(entry.detail).toEqual({ role: 'ADMINISTRATOR' })
  })

  test('a system action has no actor', () => {
    expect(auditEntry({ actorId: null, action: 'account.erased.system' }).actorId).toBeNull()
  })

  test('every entry gets its own id', () => {
    expect(auditEntry(ok).id).not.toBe(auditEntry(ok).id)
  })

  // The action is the thing reports group by, so a typo must not create a new category.
  test('an action must be lowercase noun.verb', () => {
    for (const action of ['Role.Granted', 'rolegranted', 'role granted', 'role.', '.granted', '']) {
      expect(() => auditEntry({ ...ok, action })).toThrow(/action/i)
    }
    for (const action of AUDIT_ACTION_NAMES) {
      expect(() => auditEntry({ ...ok, action })).not.toThrow()
    }
    // A hyphen belongs inside a segment, never at its edge.
    for (const action of ['session.-started', 'session.started-', 'session.magic--link']) {
      expect(() => auditEntry({ ...ok, action })).toThrow(/action/i)
    }
  })
})

// Erasure must never need to reach the audit trail's content (0011). The guard cannot detect
// every kind of personal data, so it refuses the shapes that actually carry it.
describe('detail refuses personal free text (0011)', () => {
  test('an address anywhere in detail is refused', () => {
    expect(() => auditEntry({ ...ok, detail: { email: 'member@example.com' } })).toThrow(/address/i)
    expect(() => auditEntry({ ...ok, detail: { note: 'x' } })).toThrow()
    expect(() => auditEntry({ ...ok, detail: { nested: { to: 'a.b@c.co.uk' } } })).toThrow(/address/i)
  })

  test('a free-text key is refused by name', () => {
    for (const key of ['note', 'notes', 'reason', 'comment', 'message', 'body', 'citation', 'description']) {
      expect(() => auditEntry({ ...ok, detail: { [key]: 'anything' } })).toThrow(/free text/i)
    }
  })

  test('prose is refused by length, so it cannot be smuggled under another key', () => {
    expect(() => auditEntry({ ...ok, detail: { label: 'x'.repeat(MAX_DETAIL_STRING + 1) } }))
      .toThrow(/too long/i)
  })

  test('identifiers, counts and flags are what detail is for', () => {
    expect(() => auditEntry({
      ...ok,
      detail: { role: 'ADMINISTRATOR', expiresAt: 1785000000, count: 3, wasPermanent: false, previous: null },
    })).not.toThrow()
  })
})

describe('the action catalogue (J-101 criterion 5)', () => {
  test('an unregistered action cannot be written, however well formed', () => {
    expect(() => auditEntry({ ...ok, action: 'booking.refunded' })).toThrow(/not a registered audit action/)
    expect(() => auditAction('bar.stocktake.closed')).toThrow(/not a registered audit action/)
  })

  test('every action carries a label and a module the screen can group by', () => {
    for (const name of AUDIT_ACTION_NAMES) {
      const type = AUDIT_ACTIONS[name]
      expect(type.label.length).toBeGreaterThan(0)
      expect(AUDIT_MODULES).toContain(type.module)
    }
  })
})

describe('the coverage registry (J-101 criterion 5)', () => {
  test('a route is either answerable for actions or exempt with a reason, never both and never neither', () => {
    for (const entry of AUDIT_COVERAGE) {
      const covered = 'actions' in entry && entry.actions !== undefined
      expect(`${entry.route}: ${covered} ${Boolean(entry.exempt)}`)
        .toBe(`${entry.route}: ${covered} ${!covered}`)
      if (entry.exempt) expect(entry.exempt.length).toBeGreaterThan(10)
    }
  })

  test('no route is registered twice', () => {
    const routes = AUDIT_COVERAGE.map(entry => entry.route)
    expect(new Set(routes).size).toBe(routes.length)
  })
})

// One shape for every state change, so a reader never has to know which endpoint wrote the entry
// (J-101 criterion 4).
describe('field-by-field diffs (J-101 criterion 4)', () => {
  test('a change records from and to under the field that changed', () => {
    expect(changes({ disabled: [false, true] })).toEqual({ changes: { disabled: { from: false, to: true } } })
  })

  test('several fields in one entry each keep their own pair', () => {
    expect(changes({ verified: [false, true], factor: [null, 'totp'] })).toEqual({
      changes: { verified: { from: false, to: true }, factor: { from: null, to: 'totp' } },
    })
  })

  test('an absent value is recorded as null rather than dropped', () => {
    expect(changes({ factor: [undefined, 'totp'] })).toEqual({ changes: { factor: { from: null, to: 'totp' } } })
  })

  test('a diff is still subject to the guard that keeps people out of detail', () => {
    expect(() => auditEntry({ ...ok, detail: changes({ email: ['a@b.com', 'c@d.com'] }) })).toThrow(/address/i)
  })
})

describe('the manual namespace (J-103 criterion 2)', () => {
  test('a manual action is exactly one whose name says so', () => {
    for (const name of AUDIT_ACTION_NAMES) {
      expect(`${name}: ${isManualAction(name)}`).toBe(`${name}: ${name.startsWith('manual.')}`)
    }
  })

  test('there is at least one to record, and none of them is a system action', () => {
    expect(MANUAL_ACTION_NAMES.length).toBeGreaterThan(0)
    for (const name of MANUAL_ACTION_NAMES) expect(AUDIT_ACTIONS[name].manual).toBe(true)
  })
})

// The module filter resolves to an IN list of action names. That list is a compile-time constant
// and never grows with the rows it covers, but D1 still caps a statement at 100 parameters (0003).
describe('a module filter stays inside D1 parameter limits (0003)', () => {
  test('no module holds more actions than one statement can bind', () => {
    for (const module of AUDIT_MODULES) {
      const held = AUDIT_ACTION_NAMES.filter(name => AUDIT_ACTIONS[name].module === module)
      expect(`${module}: ${held.length <= 90}`).toBe(`${module}: true`)
    }
  })
})

// Writing is closed and reading is not: the trail is history, and an entry survives the name it was
// written under being retired or arriving from the old estate (J-108).
describe('reading an action the catalogue does not hold', () => {
  test('it describes itself rather than coming back undefined', () => {
    const described = describeAction('booking.refunded')
    expect(described.label).toBe('booking.refunded')
    expect(described.module).toBe('unknown')
    expect(described.manual).toBeUndefined()
  })

  test('a registered action still describes itself from the catalogue', () => {
    for (const name of AUDIT_ACTION_NAMES) expect(describeAction(name)).toEqual(AUDIT_ACTIONS[name])
  })
})
