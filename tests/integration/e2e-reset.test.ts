import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyMigrations } from '#tests/helpers/database'
import { resetDatabase } from '#tests/helpers/reset-database'

// The e2e harness empties the database between suites; what a fresh migration seeds must come
// back, or a suite starts from a state production never has (the severities, the board's calls).

const SEVERITIES = 'SELECT severity, requires_follow_up AS requiresFollowUp FROM incident_severity_config ORDER BY severity'
const MILESTONES = 'SELECT label, sort, side, active FROM backstage_milestone_types ORDER BY sort, label'

describe('the e2e reset leaves what a fresh migration seeds (question 12)', () => {
  test('seeded configuration comes back as migrated, and nothing a suite wrote survives', async () => {
    const file = join(tmpdir(), `e2e-reset-${crypto.randomUUID()}.db`)
    try {
      const migrated = new Database(file)
      await applyMigrations(migrated)
      const fresh = { severities: migrated.query(SEVERITIES).all(), milestones: migrated.query(MILESTONES).all() }
      expect(fresh.severities).toHaveLength(4)
      expect(fresh.milestones.length).toBeGreaterThan(0)

      // What a suite leaves behind: a severity routed, a board call gone, a person registered.
      migrated.run(`UPDATE incident_severity_config SET requires_follow_up = 1 WHERE severity = 'SERIOUS'`)
      migrated.run(`DELETE FROM backstage_milestone_types WHERE label = 'Clearance'`)
      migrated.run(`INSERT INTO users (id, email, name) VALUES ('u-1', 'someone@example.invalid', 'Someone')`)
      migrated.close()

      await resetDatabase(file)

      const after = new Database(file, { readonly: true })
      try {
        expect(after.query(SEVERITIES).all()).toEqual(fresh.severities)
        expect(after.query(MILESTONES).all()).toEqual(fresh.milestones)
        expect(after.query('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 })
      }
      finally {
        after.close()
      }
    }
    finally {
      rmSync(file, { force: true })
    }
  })
})
