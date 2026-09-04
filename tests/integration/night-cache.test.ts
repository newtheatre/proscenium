import { describe, expect, test } from 'bun:test'
import { performancesOnNightQuery } from '#server/utils/performances'
import {
  memoryNightCacheStore,
  nightCacheKey,
  readNightCache,
  writeNightCache,
} from '#shared/utils/night-cache'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { PerformanceOnNight } from '#server/utils/performances'

// K-103 against a real night on the real migrations: two venues, each running, is the case a
// key of the night alone gets wrong. The screens are not built yet; the scoping rule is.

const NIGHT = '2026-10-17'

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function performancesOn(database: TestDatabase, night: string, venueId?: string): Omit<PerformanceOnNight, 'night'>[] {
  const [statement, ...parameters] = boundStatement(database, performancesOnNightQuery(night, venueId))
  return rows<Omit<PerformanceOnNight, 'night'>>(database, statement, ...parameters)
}

describe('a night with two venues running (K-103 criterion 1)', () => {
  test('each venue caches its own night, and neither can read the other', async () => {
    await withDatabase((database) => {
      const house = tonightsPerformance(database, { suffix: 'house', night: NIGHT })
      const studio = tonightsPerformance(database, { suffix: 'studio', night: NIGHT })

      const store = memoryNightCacheStore()
      for (const venueId of [house.venueId, studio.venueId]) {
        writeNightCache(
          store,
          nightCacheKey({ screen: 'door', night: NIGHT, venueId }),
          performancesOn(database, NIGHT, venueId),
        )
      }

      const atTheHouse = readNightCache<Omit<PerformanceOnNight, 'night'>[]>(
        store, nightCacheKey({ screen: 'door', night: NIGHT, venueId: house.venueId }))
      const atTheStudio = readNightCache<Omit<PerformanceOnNight, 'night'>[]>(
        store, nightCacheKey({ screen: 'door', night: NIGHT, venueId: studio.venueId }))

      expect(atTheHouse?.data.map(one => one.id)).toEqual([house.performanceId])
      expect(atTheStudio?.data.map(one => one.id)).toEqual([studio.performanceId])
    })
  })

  test('a screen covering the whole night holds both, and says that is what it is', async () => {
    await withDatabase((database) => {
      const house = tonightsPerformance(database, { suffix: 'house', night: NIGHT })
      const studio = tonightsPerformance(database, { suffix: 'studio', night: NIGHT })

      const store = memoryNightCacheStore()
      const key = nightCacheKey({ screen: 'hub', night: NIGHT, wholeNight: true })
      writeNightCache(store, key, performancesOn(database, NIGHT))

      const cached = readNightCache<Omit<PerformanceOnNight, 'night'>[]>(store, key)
      expect(new Set(cached?.data.map(one => one.id))).toEqual(new Set([house.performanceId, studio.performanceId]))
    })
  })

  // One venue running a matinee and an evening is one venue's night, so the venue key holds both
  // and a screen that is about one performance says which (E-127 criterion 1).
  test('a matinee and an evening at one venue are one venue night and two performance keys', async () => {
    await withDatabase((database) => {
      const evening = tonightsPerformance(database, { suffix: 'evening', night: NIGHT })
      const matinee = tonightsPerformance(database, {
        suffix: 'matinee', night: NIGHT, venueId: evening.venueId, curtainHoursAfterNightStart: 10.5,
      })

      const store = memoryNightCacheStore()
      const venueKey = nightCacheKey({ screen: 'door', night: NIGHT, venueId: evening.venueId })
      writeNightCache(store, venueKey, performancesOn(database, NIGHT, evening.venueId))
      expect(readNightCache<Omit<PerformanceOnNight, 'night'>[]>(store, venueKey)?.data).toHaveLength(2)

      expect(nightCacheKey({ screen: 'door', night: NIGHT, venueId: evening.venueId, performanceId: matinee.performanceId }))
        .not.toBe(nightCacheKey({ screen: 'door', night: NIGHT, venueId: evening.venueId, performanceId: evening.performanceId }))
    })
  })
})
