import { describe, expect, test } from 'bun:test'
import { milestoneTypesQuery, presetsQuery } from '#server/utils/backstage'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Issue 1313: after every migration, each seeded call sits on the end whose wording it carries.
// The four presets are issue 1318's seed; this runs over it, so a reordering cannot mislabel them.

async function seeded(statement: SQL): Promise<Record<string, unknown>[]> {
  const database = await createTestDatabase()
  try {
    const [query, ...parameters] = boundStatement(database, statement)
    return rows(database, query, ...parameters)
  }
  finally {
    database.close()
  }
}

describe('the seeded calls are placed on their own end (issue 1313)', () => {
  test('front of house opens the house and says it is ready to restart; the wings call the rest', async () => {
    const found = await seeded(milestoneTypesQuery(false))
    const sideOf = (label: string): unknown => found.find(row => row.label === label)?.side
    expect(sideOf('House open')).toBe('FOH')
    expect(sideOf('Ready to restart')).toBe('FOH')
    for (const label of ['Clearance', 'Curtain up', 'Interval', 'Restart', 'End']) expect(sideOf(label)).toBe('BACKSTAGE')
  })

  test('the foyer holds and clears the show and calls standby; the wings call the ambulance', async () => {
    const found = await seeded(presetsQuery(false))
    const sideOf = (label: string): unknown => found.find(row => row.label === label)?.side
    expect(sideOf('Standby')).toBe('FOH')
    expect(sideOf('Hold')).toBe('FOH')
    expect(sideOf('Clear')).toBe('FOH')
    expect(sideOf('Ambulance')).toBe('BACKSTAGE')
  })
})
