import { describe, expect, test } from 'bun:test'
import { CONFIG_KEY_NAMES } from '#shared/utils/config'
import { applyTag, databaseBefore } from '#tests/helpers/migrations'

// 0263: the committee's rota override is renamed, and a night already set moves with it.

const names: string[] = CONFIG_KEY_NAMES
const RENAME_TAG = '0140_the_committee_override_covers_every_rota_role'

describe('the committee override is named SHIFT_COMMITTEE_UNTIL (0263)', () => {
  test('the registry knows the new key and no longer knows the bar one', () => {
    expect(names).toContain('SHIFT_COMMITTEE_UNTIL')
    expect(names).not.toContain('BAR_SHIFT_COMMITTEE_UNTIL')
  })

  test('a stored night keeps its value and its time under the new key', async () => {
    const raw = await databaseBefore(RENAME_TAG)
    try {
      raw.exec(`INSERT INTO config (key, value, updated_by, updated_at) VALUES ('BAR_SHIFT_COMMITTEE_UNTIL', '"2026-12-13"', NULL, 1700000000)`)
      raw.exec(`INSERT INTO config (key, value, updated_by, updated_at) VALUES ('BAR_TAB_CAP_PENCE', '2000', NULL, 1700000001)`)

      await applyTag(raw, RENAME_TAG)

      expect(raw.query('SELECT key, value, updated_at AS updatedAt FROM config ORDER BY key').all()).toEqual([
        { key: 'BAR_TAB_CAP_PENCE', value: '2000', updatedAt: 1700000001 },
        { key: 'SHIFT_COMMITTEE_UNTIL', value: '"2026-12-13"', updatedAt: 1700000000 },
      ])
    }
    finally {
      raw.close()
    }
  })
})
