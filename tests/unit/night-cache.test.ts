import { describe, expect, test } from 'bun:test'
import { effectScope, nextTick, ref } from 'vue'
import { primeNightCache, useNightCache } from '#composables/useNightCache'
import { lastSyncedLabel } from '#shared/utils/night-shell'
import {
  NIGHT_CACHE_PREFIX,
  memoryNightCacheStore,
  nightCacheKey,
  nightCacheKeyParts,
  pruneNightCache,
  readNightCache,
  refreshNightCache,
  writeNightCache,
} from '#shared/utils/night-cache'
import type { NightCacheStore } from '#shared/utils/night-cache'

// K-103: what a show-night screen keeps on the device, and what it is allowed to claim about it.
// The composable binds these rules to localStorage; the rules themselves are held here.

const NIGHT = '2026-10-17'
const OTHER_NIGHT = '2026-10-18'

describe('a key names the venue or the performance, never the night alone (K-103)', () => {
  test('a screen at a venue on a night is one key', () => {
    const key = nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a' })
    expect(key.startsWith(NIGHT_CACHE_PREFIX)).toBe(true)
    expect(key).toContain(NIGHT)
    expect(key).toContain('venue-a')
  })

  // The trap this story exists to avoid: two venues run one night, and a duty manager who
  // switches venue must not be served the other house's screen.
  test('two venues on one night are two keys', () => {
    expect(nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a' }))
      .not.toBe(nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-b' }))
  })

  test('a matinee and an evening at one venue are two keys', () => {
    expect(nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a', performanceId: 'matinee' }))
      .not.toBe(nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a', performanceId: 'evening' }))
  })

  test('two screens at one venue are two keys', () => {
    expect(nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a' }))
      .not.toBe(nightCacheKey({ screen: 'till', night: NIGHT, venueId: 'venue-a' }))
  })

  test('the same scope always builds the same key, whatever order it was written in', () => {
    expect(nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a', performanceId: 'p1' }))
      .toBe(nightCacheKey({ performanceId: 'p1', venueId: 'venue-a', night: NIGHT, screen: 'door' }))
  })

  test('a scope naming neither a venue nor a performance is refused', () => {
    expect(() => nightCacheKey({ screen: 'door', night: NIGHT })).toThrow()
  })

  // A screen that really does cover the whole night is legitimate, and has to say so: the failure
  // mode is forgetting the venue, so forgetting cannot be spelled the same way as meaning it.
  test('a whole-night screen is expressible, but only by saying so', () => {
    const key = nightCacheKey({ screen: 'hub', night: NIGHT, wholeNight: true })
    expect(key).toContain(NIGHT)
    expect(key).not.toBe(nightCacheKey({ screen: 'hub', night: NIGHT, venueId: 'venue-a' }))
  })

  test('whole-night and a venue together are refused, because one of them is a mistake', () => {
    expect(() => nightCacheKey({ screen: 'hub', night: NIGHT, venueId: 'venue-a', wholeNight: true })).toThrow()
    expect(() => nightCacheKey({ screen: 'hub', night: NIGHT, performanceId: 'p1', wholeNight: true })).toThrow()
  })

  test('a night that is not a show-night label is refused', () => {
    expect(() => nightCacheKey({ screen: 'door', night: '17 October', venueId: 'venue-a' })).toThrow()
    expect(() => nightCacheKey({ screen: 'door', night: '2026-02-30', venueId: 'venue-a' })).toThrow()
  })

  test('a screen name or an id carrying the separator is refused rather than silently reshaped', () => {
    expect(() => nightCacheKey({ screen: 'door:main', night: NIGHT, venueId: 'venue-a' })).toThrow()
    expect(() => nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue:a' })).toThrow()
    expect(() => nightCacheKey({ screen: '', night: NIGHT, venueId: 'venue-a' })).toThrow()
  })

  test('a key reads back as the scope it was built from', () => {
    const key = nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a', performanceId: 'p1' })
    expect(nightCacheKeyParts(key)).toEqual({
      screen: 'door', night: NIGHT, venueId: 'venue-a', performanceId: 'p1',
    })
  })

  test('anything else on the device is not ours to read', () => {
    expect(nightCacheKeyParts('nuxt-colour-mode')).toBeNull()
    expect(nightCacheKeyParts(`${NIGHT_CACHE_PREFIX}:door`)).toBeNull()
  })
})

describe('what a screen reads back, and what it may claim about it (criteria 1 and 4)', () => {
  const key = nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a' })

  test('an entry carries its data and the instant that data came from', () => {
    const store = memoryNightCacheStore()
    const at = new Date('2026-10-17T18:12:00Z')
    writeNightCache(store, key, { admitted: 3 }, at)

    const read = readNightCache<{ admitted: number }>(store, key)
    expect(read?.data).toEqual({ admitted: 3 })
    expect(read?.cachedAt).toBe(at.getTime())
    expect(read?.night).toBe(NIGHT)
  })

  // Criterion 4: no cached screen presents itself as live. The label the screen shows is the one
  // K-102 already ships, over the instant this hands it.
  test('the instant it hands back is what NightStale labels', () => {
    const store = memoryNightCacheStore()
    writeNightCache(store, key, { admitted: 3 }, new Date('2026-10-17T18:12:00Z'))
    const read = readNightCache(store, key)
    expect(lastSyncedLabel(read!.cachedAt)).toBe('Last synced 19:12')
  })

  test('nothing cached reads as nothing, which is what "not yet synced" is made of', () => {
    expect(readNightCache(memoryNightCacheStore(), key)).toBeNull()
  })

  test('a corrupt entry reads as nothing rather than throwing into a screen', () => {
    const store = memoryNightCacheStore()
    store.setItem(key, 'half a json')
    expect(readNightCache(store, key)).toBeNull()
  })

  // The key is stamped inside the entry as well as outside it, so an entry copied or renamed
  // under another key is refused instead of serving one venue's night to another.
  test('an entry stamped with another key is refused', () => {
    const store = memoryNightCacheStore()
    const elsewhere = nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-b' })
    writeNightCache(store, elsewhere, { admitted: 3 })
    store.setItem(key, store.getItem(elsewhere)!)
    expect(readNightCache(store, key)).toBeNull()
  })

  test('an entry that is not the shape this build writes is refused', () => {
    const store = memoryNightCacheStore()
    store.setItem(key, JSON.stringify({ key, night: NIGHT, data: { admitted: 3 } }))
    expect(readNightCache(store, key)).toBeNull()
  })

  test('a key that is not one of ours is never written', () => {
    expect(() => writeNightCache(memoryNightCacheStore(), 'nuxt-colour-mode', { admitted: 3 })).toThrow()
  })

  // A device that cannot store anything still has to render: the fallback is memory, so a screen
  // holds its night for as long as the tab lives rather than failing on open.
  test('a store that refuses a write is not allowed to break the screen', () => {
    const refuses: NightCacheStore = {
      ...memoryNightCacheStore(),
      setItem: () => { throw new Error('quota exceeded') },
    }
    expect(writeNightCache(refuses, key, { admitted: 3 })).toBeNull()
  })
})

describe('a failed load never overwrites what the screen is showing (criterion 2)', () => {
  const key = nightCacheKey({ screen: 'till', night: NIGHT, venueId: 'venue-a' })

  test('a load that answers is written and handed back', async () => {
    const store = memoryNightCacheStore()
    const entry = await refreshNightCache(store, key, async () => ({ pints: 2 }))
    expect(entry?.data).toEqual({ pints: 2 })
    expect(readNightCache(store, key)?.data).toEqual({ pints: 2 })
  })

  test('a load that fails leaves the last good night exactly where it was', async () => {
    const store = memoryNightCacheStore()
    writeNightCache(store, key, { pints: 2 }, new Date('2026-10-17T18:12:00Z'))

    await expect(refreshNightCache(store, key, () => Promise.reject(new Error('offline')))).rejects.toThrow('offline')

    const read = readNightCache<{ pints: number }>(store, key)
    expect(read?.data).toEqual({ pints: 2 })
    expect(read?.cachedAt).toBe(new Date('2026-10-17T18:12:00Z').getTime())
  })

  test('a load that fails with nothing cached leaves nothing behind', async () => {
    const store = memoryNightCacheStore()
    await expect(refreshNightCache(store, key, () => Promise.reject(new Error('offline')))).rejects.toThrow('offline')
    expect(readNightCache(store, key)).toBeNull()
  })
})

describe('a night ends and its cache goes with it', () => {
  test('other nights are dropped, tonight is kept, and nothing else is touched', () => {
    const store = memoryNightCacheStore()
    const tonight = nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a' })
    const alsoTonight = nightCacheKey({ screen: 'till', night: NIGHT, venueId: 'venue-b' })
    const lastNight = nightCacheKey({ screen: 'door', night: OTHER_NIGHT, venueId: 'venue-a' })
    writeNightCache(store, tonight, { admitted: 1 })
    writeNightCache(store, alsoTonight, { pints: 1 })
    writeNightCache(store, lastNight, { admitted: 9 })
    store.setItem('nuxt-colour-mode', 'dark')

    expect(pruneNightCache(store, NIGHT)).toEqual([lastNight])
    expect(readNightCache(store, tonight)).not.toBeNull()
    expect(readNightCache(store, alsoTonight)).not.toBeNull()
    expect(readNightCache(store, lastNight)).toBeNull()
    expect(store.getItem('nuxt-colour-mode')).toBe('dark')
  })
})

describe('what a screen holding one of these sees (criteria 2 and 3)', () => {
  const key = nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-a' })
  const elsewhere = nightCacheKey({ screen: 'door', night: NIGHT, venueId: 'venue-b' })

  // A composable is only reactive inside a scope, and nothing here mounts: the guarantees under
  // test are what the screen holds, not what it paints.
  async function inScope(fn: () => Promise<void> | void): Promise<void> {
    const scope = effectScope()
    try {
      await scope.run(fn)
    }
    finally {
      scope.stop()
    }
  }

  test('it opens on what the device holds, with no round trip at all', async () => {
    await inScope(() => {
      const store = memoryNightCacheStore()
      writeNightCache(store, key, { admitted: 3 }, new Date('2026-10-17T18:12:00Z'))

      let asked = 0
      const cache = useNightCache(key, async () => {
        asked++
        return await Promise.resolve({ admitted: 9 })
      }, { store, immediate: false })

      cache.recall()
      expect(cache.data.value).toEqual({ admitted: 3 })
      expect(lastSyncedLabel(cache.cachedAt.value)).toBe('Last synced 19:12')
      expect(cache.live.value).toBe(false)
      expect(asked).toBe(0)
    })
  })

  test('the network dropping leaves the screen full, stale and honest about it', async () => {
    await inScope(async () => {
      const store = memoryNightCacheStore()
      writeNightCache(store, key, { admitted: 3 }, new Date('2026-10-17T18:12:00Z'))

      const cache = useNightCache<{ admitted: number }>(key, () => Promise.reject(new Error('offline')), { store, immediate: false })
      cache.recall()
      await cache.refresh()

      expect(cache.data.value).toEqual({ admitted: 3 })
      expect(lastSyncedLabel(cache.cachedAt.value)).toBe('Last synced 19:12')
      expect(cache.error.value?.message).toBe('offline')
      expect(cache.live.value).toBe(false)
      expect(cache.pending.value).toBe(false)
    })
  })

  test('a load that answers replaces the night and sweeps the nights it left', async () => {
    await inScope(async () => {
      const store = memoryNightCacheStore()
      const lastNight = nightCacheKey({ screen: 'door', night: OTHER_NIGHT, venueId: 'venue-a' })
      writeNightCache(store, lastNight, { admitted: 99 })

      const cache = useNightCache(key, () => Promise.resolve({ admitted: 9 }), { store, immediate: false })
      await cache.refresh()

      expect(cache.data.value).toEqual({ admitted: 9 })
      expect(cache.live.value).toBe(true)
      expect(readNightCache(store, key)?.data).toEqual({ admitted: 9 })
      expect(readNightCache(store, lastNight)).toBeNull()
    })
  })

  // The trap, at the screen: a duty manager switching venue reads their own house, not the other.
  test('moving venue reads the other venue, never the one already on screen', async () => {
    await inScope(async () => {
      const store = memoryNightCacheStore()
      writeNightCache(store, key, { admitted: 3 })
      writeNightCache(store, elsewhere, { admitted: 7 })

      const at = ref(key)
      const cache = useNightCache<{ admitted: number }>(at, () => Promise.reject(new Error('offline')), { store, immediate: false })
      cache.recall()
      expect(cache.data.value).toEqual({ admitted: 3 })

      at.value = elsewhere
      await nextTick()
      expect(cache.data.value).toEqual({ admitted: 7 })
    })
  })

  test('an answer that arrives after the screen has moved venue is dropped', async () => {
    await inScope(async () => {
      const store = memoryNightCacheStore()
      writeNightCache(store, elsewhere, { admitted: 7 })

      const at = ref(key)
      const slow = useNightCache<{ admitted: number }>(at, () => Promise.resolve({ admitted: 3 }), { store, immediate: false })
      const loading = slow.refresh()
      at.value = elsewhere
      await loading
      await nextTick()

      expect(slow.data.value).toEqual({ admitted: 7 })
    })
  })

  // Criterion 3: cached from the start of the shift, not from the first visit to the screen.
  test('one screen caches what another will need, and a failure to is not the first screen s problem', async () => {
    const store = memoryNightCacheStore()
    const card = nightCacheKey({ screen: 'emergency', night: NIGHT, venueId: 'venue-a' })

    expect(await primeNightCache(card, () => ({ assemblyPoint: 'The car park' }), store)).toBe(true)
    expect(readNightCache<{ assemblyPoint: string }>(store, card)?.data.assemblyPoint).toBe('The car park')

    expect(await primeNightCache(card, () => Promise.reject(new Error('offline')), store)).toBe(false)
    expect(readNightCache<{ assemblyPoint: string }>(store, card)?.data.assemblyPoint).toBe('The car park')
  })
})

describe('one composable owns the device store', () => {
  // The old estate mirrored the emergency card to localStorage from the screen that showed it,
  // which is how it survived a dropped connection but not an offline first load (K-103).
  test('nothing else in the application reaches for the device store', async () => {
    const offenders: string[] = []
    for (const file of [...new Bun.Glob('**/*.{ts,vue}').scanSync({ cwd: 'app', onlyFiles: true })].sort()) {
      if (file === 'composables/useNightCache.ts') continue
      if ((await Bun.file(`app/${file}`).text()).includes('localStorage')) offenders.push(`app/${file}`)
    }
    expect(offenders).toEqual([])
  })
})
