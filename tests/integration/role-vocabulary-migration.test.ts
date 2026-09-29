import { describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { isAuditAction } from '#shared/utils/audit-actions'
import { databaseBefore, execMigration, migrationSql, withMigration } from '#tests/helpers/migrations'

// A-135 criteria 3 to 5 against a scratch database at the shape the fold meets (0112): the grants a
// real committee holds, then the one migration, then what each holder and each setting is left with.

const FOLD = 'the_retired_roles_fold_into_the_post_roles'
const PAST = 1_600_000_000
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

function held(raw: Database, userId: string): [string, number | null][] {
  return (raw.query('SELECT role, expires_at AS expiresAt FROM role_grants WHERE user_id = ? ORDER BY role').all(userId) as { role: string, expiresAt: number | null }[])
    .map(row => [row.role, row.expiresAt])
}

function setting(raw: Database, key: string, value: unknown): void {
  raw.query('INSERT INTO config (key, value, updated_by, updated_at) VALUES (?, ?, NULL, 1700000000)').run(key, JSON.stringify(value))
}

function stored(raw: Database, key: string): unknown {
  const row = raw.query('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | null
  return row ? JSON.parse(row.value) as unknown : null
}

function audited(raw: Database, action: string): { actorId: string | null, target: string, detail: Record<string, unknown> }[] {
  return (raw.query('SELECT actor_id AS actorId, target, detail FROM audit_log WHERE action = ? ORDER BY target, detail').all(action) as { actorId: string | null, target: string, detail: string }[])
    .map(row => ({ ...row, detail: JSON.parse(row.detail) as Record<string, unknown> }))
}

async function refused(seed: (raw: Database) => void): Promise<void> {
  const raw = await databaseBefore(FOLD)
  try {
    seed(raw)
    const sql = await migrationSql(FOLD)
    expect(() => execMigration(raw, sql)).toThrow()
  }
  finally {
    raw.close()
  }
}

describe('a retired grant folds into the post role its holder already holds (A-135 criterion 3)', () => {
  test('a bar grant folds into front of house, the later expiry winning and the warning re-armed', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'foh')
      grant(raw, 'foh', 'BAR_MANAGER', { expiresAt: LATER })
      grant(raw, 'foh', 'FOH_MANAGER', { expiresAt: FUTURE, warnedAt: 1_750_000_000 })
    }, (raw) => {
      expect(held(raw, 'foh')).toEqual([['FOH_MANAGER', LATER]])
      expect(raw.query('SELECT expiry_warned_at AS warnedAt FROM role_grants WHERE user_id = ?').get('foh')).toEqual({ warnedAt: null })
    })
  })

  test('safety and training both fold into the Theatre Manager, a permanent grant beating any date', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'tm')
      grant(raw, 'tm', 'SAFETY_OFFICER', { expiresAt: LATER })
      grant(raw, 'tm', 'TRAINING_MANAGER', { expiresAt: null })
      grant(raw, 'tm', 'THEATRE_MANAGER', { expiresAt: FUTURE })
    }, (raw) => {
      expect(held(raw, 'tm')).toEqual([['THEATRE_MANAGER', null]])
    })
  })

  test('an earlier retired expiry leaves the post grant exactly as it was', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'foh')
      grant(raw, 'foh', 'BAR_MANAGER', { expiresAt: FUTURE })
      grant(raw, 'foh', 'FOH_MANAGER', { expiresAt: LATER, warnedAt: 1_750_000_000 })
    }, (raw) => {
      expect(raw.query('SELECT role, expires_at AS expiresAt, expiry_warned_at AS warnedAt FROM role_grants WHERE user_id = ?').all('foh'))
        .toEqual([{ role: 'FOH_MANAGER', expiresAt: LATER, warnedAt: 1_750_000_000 }])
    })
  })

  test('an accessibility grant becomes the Secretary\'s, keeping its expiry, granter and note', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'granter')
      person(raw, 'sec')
      grant(raw, 'sec', 'ACCESSIBILITY_OFFICER', { expiresAt: FUTURE, grantedBy: 'granter', note: 'Secretary (4.2)' })
    }, (raw) => {
      expect(raw.query('SELECT role, expires_at AS expiresAt, granted_by AS grantedBy, note FROM role_grants WHERE user_id = ?').all('sec'))
        .toEqual([{ role: 'SECRETARY', expiresAt: FUTURE, grantedBy: 'granter', note: 'Secretary (4.2)' }])
    })
  })

  test('an accessibility grant beside a Secretary grant folds into it', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'sec')
      grant(raw, 'sec', 'ACCESSIBILITY_OFFICER', { expiresAt: LATER })
      grant(raw, 'sec', 'SECRETARY', { expiresAt: FUTURE })
    }, (raw) => {
      expect(held(raw, 'sec')).toEqual([['SECRETARY', LATER]])
    })
  })
})

describe('a retired grant beside the IT Manager\'s is dropped into it (A-135 criterion 3)', () => {
  test('the IT Manager keeps one grant, and its expiry never moves', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'itm')
      grant(raw, 'itm', 'ADMIN', { expiresAt: LATER })
      grant(raw, 'itm', 'BAR_MANAGER', { expiresAt: FUTURE })
      grant(raw, 'itm', 'TRAINING_MANAGER', { expiresAt: LATER })
      grant(raw, 'itm', 'MANAGER', { expiresAt: FUTURE })
    }, (raw) => {
      expect(held(raw, 'itm')).toEqual([['ADMIN', LATER]])
    })
  })

  test('a post role beats the IT Manager\'s as the fold target', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'both')
      grant(raw, 'both', 'ADMIN', { expiresAt: null })
      grant(raw, 'both', 'FOH_MANAGER', { expiresAt: FUTURE })
      grant(raw, 'both', 'BAR_MANAGER', { expiresAt: LATER })
    }, (raw) => {
      expect(held(raw, 'both')).toEqual([['ADMIN', null], ['FOH_MANAGER', LATER]])
    })
  })

  test('a lapsed retired grant is removed whatever else its holder holds, since it gives nothing', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'gone')
      grant(raw, 'gone', 'SAFETY_OFFICER', { expiresAt: PAST })
    }, (raw) => {
      expect(held(raw, 'gone')).toEqual([])
      expect(audited(raw, 'role.retired')).toEqual([
        { actorId: null, target: 'user:gone', detail: { role: 'SAFETY_OFFICER', expiresAt: PAST, permanent: false } },
      ])
    })
  })

  test('no retired role is left anywhere, and every other grant is untouched', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'one')
      person(raw, 'two')
      grant(raw, 'one', 'TREASURER', { expiresAt: FUTURE })
      grant(raw, 'one', 'ADMIN', { expiresAt: null })
      grant(raw, 'one', 'SAFETY_OFFICER', { expiresAt: null })
      grant(raw, 'two', 'THEATRE_MANAGER', { expiresAt: FUTURE })
    }, (raw) => {
      const left = raw.query(`SELECT count(*) AS n FROM role_grants WHERE role NOT IN ('ADMIN', 'PRESIDENT', 'SECRETARY', 'TREASURER', 'FOH_MANAGER', 'THEATRE_MANAGER', 'COMMITTEE')`).get()
      expect(left).toEqual({ n: 0 })
      expect(held(raw, 'one')).toEqual([['ADMIN', null], ['TREASURER', FUTURE]])
      expect(held(raw, 'two')).toEqual([['THEATRE_MANAGER', FUTURE]])
    })
  })
})

describe('the guard refuses a grant that would land on the wrong post or lose access (A-135 criterion 4)', () => {
  test('a lone bar grant is refused rather than widened to the whole Front of House Manager role', async () => {
    await refused((raw) => {
      person(raw, 'lone')
      grant(raw, 'lone', 'BAR_MANAGER', { expiresAt: FUTURE })
    })
  })

  test('a lone manager grant is refused, even beside a post role', async () => {
    await refused((raw) => {
      person(raw, 'lone')
      grant(raw, 'lone', 'MANAGER', { expiresAt: FUTURE })
      grant(raw, 'lone', 'FOH_MANAGER', { expiresAt: FUTURE })
    })
  })

  test('a grant that outlives its holder\'s IT Manager grant is refused, so nobody\'s access is shortened', async () => {
    await refused((raw) => {
      person(raw, 'itm')
      grant(raw, 'itm', 'ADMIN', { expiresAt: FUTURE })
      grant(raw, 'itm', 'TRAINING_MANAGER', { expiresAt: null })
    })
  })

  test('a refused run writes nothing at all', async () => {
    const raw = await databaseBefore(FOLD)
    try {
      person(raw, 'lone')
      grant(raw, 'lone', 'BAR_MANAGER', { expiresAt: FUTURE })
      const sql = await migrationSql(FOLD)
      expect(() => execMigration(raw, sql)).toThrow()
      expect(held(raw, 'lone')).toEqual([['BAR_MANAGER', FUTURE]])
      expect(raw.query('SELECT count(*) AS n FROM audit_log').get()).toEqual({ n: 0 })
    }
    finally {
      raw.close()
    }
  })
})

describe('a post holder keeps one grant, not a second Committee one (A-135 criterion 3)', () => {
  test('a Committee grant beside a post role expiring no earlier is removed', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'foh')
      grant(raw, 'foh', 'FOH_MANAGER', { expiresAt: FUTURE })
      grant(raw, 'foh', 'BAR_MANAGER', { expiresAt: FUTURE })
      grant(raw, 'foh', 'COMMITTEE', { expiresAt: FUTURE })
    }, (raw) => {
      expect(held(raw, 'foh')).toEqual([['FOH_MANAGER', FUTURE]])
    })
  })

  test('a Committee grant that outlives its post grant is kept', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'tr')
      grant(raw, 'tr', 'TREASURER', { expiresAt: FUTURE })
      grant(raw, 'tr', 'COMMITTEE', { expiresAt: LATER })
    }, (raw) => {
      expect(held(raw, 'tr')).toEqual([['COMMITTEE', LATER], ['TREASURER', FUTURE]])
    })
  })

  test('a Committee grant beside the IT Manager\'s alone is kept, because the function is not a post', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'archivist')
      grant(raw, 'archivist', 'ADMIN', { expiresAt: null })
      grant(raw, 'archivist', 'COMMITTEE', { expiresAt: FUTURE })
    }, (raw) => {
      expect(held(raw, 'archivist')).toEqual([['ADMIN', null], ['COMMITTEE', FUTURE]])
    })
  })
})

describe('every moved grant is audited first, with no actor and no free text (A-135 criterion 5, 0011)', () => {
  test('one role.merged entry per folded grant, naming both roles and the resulting expiry', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'foh')
      person(raw, 'itm')
      grant(raw, 'foh', 'BAR_MANAGER', { expiresAt: LATER, note: 'A note that must not travel' })
      grant(raw, 'foh', 'FOH_MANAGER', { expiresAt: FUTURE })
      grant(raw, 'foh', 'COMMITTEE', { expiresAt: FUTURE })
      grant(raw, 'itm', 'ADMIN', { expiresAt: null })
      grant(raw, 'itm', 'TRAINING_MANAGER', { expiresAt: FUTURE })
    }, (raw) => {
      expect(audited(raw, 'role.merged')).toEqual([
        { actorId: null, target: 'user:foh', detail: { from: 'BAR_MANAGER', role: 'FOH_MANAGER', expiresAt: LATER, permanent: false } },
        { actorId: null, target: 'user:foh', detail: { from: 'COMMITTEE', role: 'FOH_MANAGER', expiresAt: LATER, permanent: false } },
        { actorId: null, target: 'user:itm', detail: { from: 'TRAINING_MANAGER', role: 'ADMIN', expiresAt: null, permanent: true } },
      ])
      expect(JSON.stringify(audited(raw, 'role.merged')).includes('must not travel')).toBe(false)
      expect(isAuditAction('role.merged')).toBe(true)
    })
  })

  test('a database with nothing to move writes no entry at all, and a second run changes nothing', async () => {
    await withMigration(FOLD, (raw) => {
      person(raw, 'holder')
      grant(raw, 'holder', 'FOH_MANAGER', { expiresAt: FUTURE })
      setting(raw, 'BAR_AUTHORISED_TAB_ROLES', ['COMMITTEE'])
    }, (raw) => {
      expect(raw.query('SELECT count(*) AS n FROM audit_log').get()).toEqual({ n: 0 })
      expect(held(raw, 'holder')).toEqual([['FOH_MANAGER', FUTURE]])
    }, { runs: 2 })
  })
})

describe('role-keyed settings name the successor, never silently lose a role (A-135 criterion 5)', () => {
  test('the tab roles map each retired role to its successor, dropping the ones with none', async () => {
    await withMigration(FOLD, (raw) => {
      setting(raw, 'BAR_AUTHORISED_TAB_ROLES', ['BAR_MANAGER', 'MANAGER', 'FOH_MANAGER', 'COMMITTEE', 'SAFETY_OFFICER', 'TRAINING_MANAGER'])
    }, (raw) => {
      expect(stored(raw, 'BAR_AUTHORISED_TAB_ROLES')).toEqual(['FOH_MANAGER', 'COMMITTEE', 'THEATRE_MANAGER'])
      expect(audited(raw, 'config.changed')).toEqual([{
        actorId: null,
        target: 'config:BAR_AUTHORISED_TAB_ROLES',
        detail: {
          key: 'BAR_AUTHORISED_TAB_ROLES',
          changes: { value: { from: ['BAR_MANAGER', 'MANAGER', 'FOH_MANAGER', 'COMMITTEE', 'SAFETY_OFFICER', 'TRAINING_MANAGER'], to: ['FOH_MANAGER', 'COMMITTEE', 'THEATRE_MANAGER'] } },
        },
      }])
    })
  })

  test('the second-factor list replaces every retired role and gains the two new post roles', async () => {
    await withMigration(FOLD, (raw) => {
      setting(raw, 'PRIVILEGED_ROLES', ['ADMIN', 'MANAGER', 'THEATRE_MANAGER', 'TRAINING_MANAGER', 'ACCESSIBILITY_OFFICER', 'TREASURER', 'BAR_MANAGER', 'FOH_MANAGER', 'SAFETY_OFFICER', 'COMMITTEE'])
    }, (raw) => {
      expect(stored(raw, 'PRIVILEGED_ROLES')).toEqual(['ADMIN', 'THEATRE_MANAGER', 'SECRETARY', 'TREASURER', 'FOH_MANAGER', 'COMMITTEE', 'PRESIDENT'])
    })
  })

  test('the night report roles are rewritten too, and a setting naming no retired role is left alone', async () => {
    await withMigration(FOLD, (raw) => {
      setting(raw, 'NIGHT_REPORT_ROLES', ['SAFETY_OFFICER', 'FOH_MANAGER'])
      setting(raw, 'BAR_AUTHORISED_TAB_ROLES', ['COMMITTEE'])
    }, (raw) => {
      expect(stored(raw, 'NIGHT_REPORT_ROLES')).toEqual(['THEATRE_MANAGER', 'FOH_MANAGER'])
      expect(stored(raw, 'BAR_AUTHORISED_TAB_ROLES')).toEqual(['COMMITTEE'])
      expect(audited(raw, 'config.changed').map(entry => entry.target)).toEqual(['config:NIGHT_REPORT_ROLES'])
    })
  })
})
