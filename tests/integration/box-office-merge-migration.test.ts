import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { isAuditAction } from '#shared/utils/audit-actions'
import { withMigration } from '#tests/helpers/migrations'

// A-133 criteria 3 and 4 against a scratch database at the shape the merge meets (0090): the
// grants a real committee holds, then the one migration, then what each holder is left with.

const MERGE_TAG = '0116_the_box_office_role_folds_into_front_of_house'
const FUTURE = 2_000_000_000
const LATER = 2_100_000_000

function person(raw: Database, id: string): void {
  raw.query('INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)').run(id, `${id}@e2e.newtheatre.org.uk`, `Someone ${id}`)
}

interface GrantSeed { expiresAt: number | null, note?: string | null, grantedBy?: string | null, warnedAt?: number | null }

function grant(raw: Database, userId: string, role: string, seed: GrantSeed): void {
  raw.query('INSERT INTO role_grants (id, user_id, role, expires_at, granted_by, granted_at, note, expiry_warned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(`${userId}-${role}`, userId, role, seed.expiresAt, seed.grantedBy ?? null, 1_700_000_000, seed.note ?? null, seed.warnedAt ?? null)
}

interface GrantRow { id: string, role: string, expiresAt: number | null, grantedBy: string | null, note: string | null, warnedAt: number | null }

function grantsOf(raw: Database, userId: string): GrantRow[] {
  return raw.query(`
    SELECT id, role, expires_at AS expiresAt, granted_by AS grantedBy, note, expiry_warned_at AS warnedAt
    FROM role_grants WHERE user_id = ? ORDER BY role
  `).all(userId) as GrantRow[]
}

describe('the box office role folds into front of house (A-133 criterion 3)', () => {
  test('a box office grant with no front of house grant is renamed, keeping its expiry, granter and note', async () => {
    await withMigration(MERGE_TAG, (raw) => {
      person(raw, 'granter')
      person(raw, 'holder')
      grant(raw, 'holder', 'BOX_OFFICE', { expiresAt: FUTURE, grantedBy: 'granter', note: 'Covering until the AGM', warnedAt: 1_750_000_000 })
    }, (raw) => {
      expect(grantsOf(raw, 'holder')).toEqual([{
        id: 'holder-BOX_OFFICE',
        role: 'FOH_MANAGER',
        expiresAt: FUTURE,
        grantedBy: 'granter',
        note: 'Covering until the AGM',
        warnedAt: 1_750_000_000,
      }])
    })
  })

  test('a holder of both keeps one front of house grant, the permanent box office one winning', async () => {
    await withMigration(MERGE_TAG, (raw) => {
      person(raw, 'holder')
      grant(raw, 'holder', 'BOX_OFFICE', { expiresAt: null })
      grant(raw, 'holder', 'FOH_MANAGER', { expiresAt: FUTURE, warnedAt: 1_750_000_000 })
    }, (raw) => {
      const held = grantsOf(raw, 'holder')
      expect(held.map(row => [row.role, row.expiresAt])).toEqual([['FOH_MANAGER', null]])
      // A changed expiry re-arms the lapse warning, as a renewal does (A-119 criterion 1).
      expect(held[0]!.warnedAt).toBeNull()
    })
  })

  test('the later of two dated expiries wins', async () => {
    await withMigration(MERGE_TAG, (raw) => {
      person(raw, 'holder')
      grant(raw, 'holder', 'BOX_OFFICE', { expiresAt: LATER })
      grant(raw, 'holder', 'FOH_MANAGER', { expiresAt: FUTURE })
    }, (raw) => {
      expect(grantsOf(raw, 'holder').map(row => [row.role, row.expiresAt])).toEqual([['FOH_MANAGER', LATER]])
    })
  })

  test('an earlier box office expiry leaves the front of house grant exactly as it was', async () => {
    await withMigration(MERGE_TAG, (raw) => {
      person(raw, 'holder')
      grant(raw, 'holder', 'BOX_OFFICE', { expiresAt: FUTURE })
      grant(raw, 'holder', 'FOH_MANAGER', { expiresAt: LATER, note: 'Kept', warnedAt: 1_750_000_000 })
    }, (raw) => {
      expect(grantsOf(raw, 'holder')).toEqual([{
        id: 'holder-FOH_MANAGER', role: 'FOH_MANAGER', expiresAt: LATER, grantedBy: null, note: 'Kept', warnedAt: 1_750_000_000,
      }])
    })
  })

  test('a permanent front of house grant is never shortened by a dated box office one', async () => {
    await withMigration(MERGE_TAG, (raw) => {
      person(raw, 'holder')
      grant(raw, 'holder', 'BOX_OFFICE', { expiresAt: LATER })
      grant(raw, 'holder', 'FOH_MANAGER', { expiresAt: null })
    }, (raw) => {
      expect(grantsOf(raw, 'holder').map(row => [row.role, row.expiresAt])).toEqual([['FOH_MANAGER', null]])
    })
  })

  test('no box office grant is left anywhere, and every other grant is untouched', async () => {
    await withMigration(MERGE_TAG, (raw) => {
      person(raw, 'one')
      person(raw, 'two')
      grant(raw, 'one', 'BOX_OFFICE', { expiresAt: FUTURE })
      grant(raw, 'one', 'TREASURER', { expiresAt: FUTURE })
      grant(raw, 'two', 'BOX_OFFICE', { expiresAt: null })
      grant(raw, 'two', 'FOH_MANAGER', { expiresAt: FUTURE })
      grant(raw, 'two', 'ADMIN', { expiresAt: null })
    }, (raw) => {
      expect(raw.query('SELECT count(*) AS n FROM role_grants WHERE role = \'BOX_OFFICE\'').get()).toEqual({ n: 0 })
      expect(grantsOf(raw, 'one').map(row => [row.role, row.expiresAt])).toEqual([['FOH_MANAGER', FUTURE], ['TREASURER', FUTURE]])
      expect(grantsOf(raw, 'two').map(row => [row.role, row.expiresAt])).toEqual([['ADMIN', null], ['FOH_MANAGER', null]])
    })
  })
})

describe('each moved grant is audited, with no free text (A-133 criterion 4, 0011)', () => {
  test('one role.merged entry per box office grant, naming both roles and the resulting expiry', async () => {
    await withMigration(MERGE_TAG, (raw) => {
      person(raw, 'renamed')
      person(raw, 'folded')
      grant(raw, 'renamed', 'BOX_OFFICE', { expiresAt: FUTURE, note: 'A note that must not travel' })
      grant(raw, 'folded', 'BOX_OFFICE', { expiresAt: LATER })
      grant(raw, 'folded', 'FOH_MANAGER', { expiresAt: FUTURE })
    }, (raw) => {
      const entries = raw.query(`
        SELECT actor_id AS actorId, target, detail FROM audit_log WHERE action = 'role.merged' ORDER BY target
      `).all() as { actorId: string | null, target: string, detail: string }[]
      expect(entries.map(entry => ({ ...entry, detail: JSON.parse(entry.detail) as unknown }))).toEqual([
        { actorId: null, target: 'user:folded', detail: { from: 'BOX_OFFICE', role: 'FOH_MANAGER', expiresAt: LATER, permanent: false } },
        { actorId: null, target: 'user:renamed', detail: { from: 'BOX_OFFICE', role: 'FOH_MANAGER', expiresAt: FUTURE, permanent: false } },
      ])
      expect(entries.some(entry => entry.detail.includes('must not travel'))).toBe(false)
      expect(isAuditAction('role.merged')).toBe(true)
    })
  })

  test('a database with no box office grant writes no entry at all', async () => {
    await withMigration(MERGE_TAG, (raw) => {
      person(raw, 'holder')
      grant(raw, 'holder', 'FOH_MANAGER', { expiresAt: FUTURE })
    }, (raw) => {
      expect(raw.query('SELECT count(*) AS n FROM audit_log WHERE action = \'role.merged\'').get()).toEqual({ n: 0 })
    })
  })
})
