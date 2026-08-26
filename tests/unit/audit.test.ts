import { describe, expect, test } from 'bun:test'
import { MAX_DETAIL_STRING, auditEntry } from '#shared/utils/audit'

const ok = { actorId: 'u-1', action: 'role.granted', target: 'user:u-2' }

describe('audit entries (0010, 0011)', () => {
  test('a well-formed entry carries an id and its parts', () => {
    const entry = auditEntry({ ...ok, detail: { role: 'ADMINISTRATOR' } })
    expect(entry.id).toMatch(/^[0-9a-z]{8,}$/i)
    expect(entry).toMatchObject({ actorId: 'u-1', action: 'role.granted', target: 'user:u-2' })
    expect(entry.detail).toEqual({ role: 'ADMINISTRATOR' })
  })

  test('a system action has no actor', () => {
    expect(auditEntry({ actorId: null, action: 'retention.swept' }).actorId).toBeNull()
  })

  test('every entry gets its own id', () => {
    expect(auditEntry(ok).id).not.toBe(auditEntry(ok).id)
  })

  // The action is the thing reports group by, so a typo must not create a new category.
  test('an action must be lowercase noun.verb', () => {
    for (const action of ['Role.Granted', 'rolegranted', 'role granted', 'role.', '.granted', '']) {
      expect(() => auditEntry({ ...ok, action })).toThrow(/action/i)
    }
    for (const action of ['role.granted', 'booking.refunded', 'bar.stocktake.closed']) {
      expect(() => auditEntry({ ...ok, action })).not.toThrow()
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
