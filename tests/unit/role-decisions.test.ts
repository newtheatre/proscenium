import { describe, expect, test } from 'bun:test'
import { administratorDecisions, decideByMap, decisionKey, formatRoleDecisions, parseRoleDecisions } from '#migration/role-decisions'
import type { RoleDecision, RoleDecisions } from '#migration/role-decisions'

// The role decisions file is the only record of a human's choice per old grant (0070): what is
// written must read back as the same choices, and a line that says less than a choice is refused.

describe('the decisions file round-trips', () => {
  test('SKIP, PERMANENT and dated lines survive format then parse, header included', () => {
    const decisions: RoleDecisions = new Map<string, RoleDecision>([
      [decisionKey('u-1', 'admin'), { role: 'COMMITTEE', expiresAt: 1_785_456_000 }],
      [decisionKey('u-2', 'trainer'), { role: 'TRAINER', expiresAt: null }],
      [decisionKey('u-3', 'legacy'), 'SKIP'],
    ])

    const text = formatRoleDecisions(decisions)
    const lines = text.split('\n')
    expect(lines[0]).toBe('# old_user_id\told_role\tunified_role|SKIP\texpires_at|PERMANENT')
    expect(lines).toContain('u-1\tadmin\tCOMMITTEE\t1785456000')
    expect(lines).toContain('u-2\ttrainer\tTRAINER\tPERMANENT')
    expect(lines).toContain('u-3\tlegacy\tSKIP\t')
    expect(text.endsWith('\n')).toBe(true)

    expect(parseRoleDecisions(text)).toEqual(decisions)
  })

  test('blank lines and comments are ignored', () => {
    const parsed = parseRoleDecisions('# a note\n\nu-1\tadmin\tCOMMITTEE\tPERMANENT\n\n')
    expect(parsed.size).toBe(1)
    expect(parsed.get(decisionKey('u-1', 'admin'))).toEqual({ role: 'COMMITTEE', expiresAt: null })
  })
})

describe('a line that is not a decision is refused', () => {
  test('a short line throws', () => {
    expect(() => parseRoleDecisions('u-1\tadmin')).toThrow(/role decision line is short/)
  })

  test('a mapped role with no expiry throws', () => {
    expect(() => parseRoleDecisions('u-1\tadmin\tCOMMITTEE')).toThrow(/no expiry/)
    expect(() => parseRoleDecisions('u-1\tadmin\tCOMMITTEE\tsoon')).toThrow(/no expiry/)
  })
})

describe('decideByMap accepts only what the map covers', () => {
  test('a grant with no mapping is left undecided, the rest take the one expiry', () => {
    const decisions = decideByMap(
      [{ user_id: 'u-1', role: 'admin' }, { user_id: 'u-2', role: 'unknown' }, { user_id: 'u-3', role: 'trainer' }],
      { admin: 'COMMITTEE', trainer: 'TRAINER' },
      1_785_456_000,
    )
    expect(decisions.size).toBe(2)
    expect(decisions.get(decisionKey('u-1', 'admin'))).toEqual({ role: 'COMMITTEE', expiresAt: 1_785_456_000 })
    expect(decisions.get(decisionKey('u-3', 'trainer'))).toEqual({ role: 'TRAINER', expiresAt: 1_785_456_000 })
    expect(decisions.has(decisionKey('u-2', 'unknown'))).toBe(false)
  })

  test('a null expiry is permanent', () => {
    const decisions = decideByMap([{ user_id: 'u-1', role: 'admin' }], { admin: 'COMMITTEE' }, null)
    expect(decisions.get(decisionKey('u-1', 'admin'))).toEqual({ role: 'COMMITTEE', expiresAt: null })
  })
})

// A-120 criterion 1 and issue #1355: a build whose IT Manager grants are all dated loses its last
// one to a lapse nobody acts on, so the review asks which is permanent rather than defaulting one.
describe('the IT Manager decisions are read apart', () => {
  test('permanent and dated IT Manager grants are named by their decision keys', () => {
    const decisions: RoleDecisions = new Map<string, RoleDecision>([
      [decisionKey('u-1', 'auth:ADMIN'), { role: 'ADMIN', expiresAt: 1_785_456_000 }],
      [decisionKey('u-2', 'ticketing:ADMIN'), { role: 'ADMIN', expiresAt: null }],
      [decisionKey('u-3', 'rooms:ADMIN'), 'SKIP'],
      [decisionKey('u-4', 'auth:TREASURER'), { role: 'TREASURER', expiresAt: null }],
    ])
    expect(administratorDecisions(decisions)).toEqual({
      permanent: [decisionKey('u-2', 'ticketing:ADMIN')],
      dated: [decisionKey('u-1', 'auth:ADMIN')],
    })
  })

  test('a file with every IT Manager dated has none permanent to keep', () => {
    const decisions: RoleDecisions = new Map<string, RoleDecision>([
      [decisionKey('u-1', 'auth:ADMIN'), { role: 'ADMIN', expiresAt: 1_785_456_000 }],
    ])
    expect(administratorDecisions(decisions).permanent).toEqual([])
    expect(administratorDecisions(new Map())).toEqual({ permanent: [], dated: [] })
  })
})
