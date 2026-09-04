import { isShowNight } from './show-night'

// What a show-night screen keeps on the device so it renders when the venue Wi-Fi drops (K-103).
// `app/composables/useNightCache.ts` binds these rules to localStorage and to a screen's state.

// In the key, so a build that changes the envelope reads none of the old one and rewrites it.
export const NIGHT_CACHE_VERSION = 1
export const NIGHT_CACHE_PREFIX = `nnt.night.${NIGHT_CACHE_VERSION}`

const SEPARATOR = ':'
// Nothing scoped: the segment cannot be an id, so it cannot collide with one.
const UNSCOPED = '*'
const SCREEN = /^[a-z][a-z0-9-]*$/
const KEY_SEGMENTS = 5

export interface NightCacheScope {
  screen: string
  night: string
  venueId?: string | null
  performanceId?: string | null
  // A screen that really does cover every venue says so. Two venues run one night, so a key that
  // named no venue by accident would serve one house's screen to the other (K-103).
  wholeNight?: boolean
}

export interface NightCacheEntry<T> {
  key: string
  night: string
  cachedAt: number
  data: T
}

// The subset of the browser's Storage a night cache uses, so localStorage satisfies it and a test
// or a device that refuses storage can supply something else.
export interface NightCacheStore {
  readonly length: number
  key: (index: number) => string | null
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function segment(name: string, value: string | null | undefined): string {
  if (value === null || value === undefined) return UNSCOPED
  if (value === '' || value === UNSCOPED || value.includes(SEPARATOR)) {
    throw new TypeError(`a night cache ${name} cannot be empty, "${UNSCOPED}" or carry "${SEPARATOR}": got "${value}"`)
  }
  return value
}

export function nightCacheKey(scope: NightCacheScope): string {
  if (!SCREEN.test(scope.screen)) {
    throw new TypeError(`a night cache screen is lower-case and hyphenated, not "${scope.screen}"`)
  }
  if (!isShowNight(scope.night)) {
    throw new TypeError(`a show night is labelled YYYY-MM-DD with a real date, not "${scope.night}"`)
  }
  const venueId = segment('venue', scope.venueId)
  const performanceId = segment('performance', scope.performanceId)
  const scoped = venueId !== UNSCOPED || performanceId !== UNSCOPED

  if (scope.wholeNight && scoped) {
    throw new TypeError('a whole-night key names no venue and no performance: one of the two is a mistake')
  }
  if (!scope.wholeNight && !scoped) {
    throw new TypeError('a night cache key names a venue or a performance, or says wholeNight: two venues may run one night')
  }
  return [NIGHT_CACHE_PREFIX, scope.screen, scope.night, venueId, performanceId].join(SEPARATOR)
}

export interface NightCacheKeyParts {
  screen: string
  night: string
  venueId: string | null
  performanceId: string | null
}

// Null for anything that is not one of ours, which is how a sweep leaves the rest of the device
// alone.
export function nightCacheKeyParts(key: string): NightCacheKeyParts | null {
  const parts = key.split(SEPARATOR)
  if (parts.length !== KEY_SEGMENTS || parts[0] !== NIGHT_CACHE_PREFIX) return null
  const [, screen, night, venueId, performanceId] = parts as [string, string, string, string, string]
  if (!SCREEN.test(screen) || !isShowNight(night)) return null
  return {
    screen,
    night,
    venueId: venueId === UNSCOPED ? null : venueId,
    performanceId: performanceId === UNSCOPED ? null : performanceId,
  }
}

function isEntry(value: unknown): value is NightCacheEntry<unknown> {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.key === 'string'
    && typeof entry.night === 'string'
    && typeof entry.cachedAt === 'number'
    && 'data' in entry
}

// Anything unreadable reads as nothing cached, and the key is stamped inside as well as outside:
// an entry copied under another key is refused rather than serving one venue's night to another.
export function readNightCache<T>(store: NightCacheStore, key: string): NightCacheEntry<T> | null {
  let stored: string | null
  try {
    stored = store.getItem(key)
  }
  catch {
    return null
  }
  if (stored === null) return null

  try {
    const parsed: unknown = JSON.parse(stored)
    if (!isEntry(parsed) || parsed.key !== key) return null
    return parsed as NightCacheEntry<T>
  }
  catch {
    return null
  }
}

// Null when the device would not take it (a full or refusing store), because a screen that cannot
// cache still has to render.
export function writeNightCache<T>(store: NightCacheStore, key: string, data: T, at: Date = new Date()): NightCacheEntry<T> | null {
  const parts = nightCacheKeyParts(key)
  if (!parts) throw new TypeError(`"${key}" is not a night cache key: build one with nightCacheKey()`)

  const entry: NightCacheEntry<T> = { key, night: parts.night, cachedAt: at.getTime(), data }
  try {
    store.setItem(key, JSON.stringify(entry))
    return entry
  }
  catch {
    return null
  }
}

export function nightCacheKeysIn(store: NightCacheStore): string[] {
  const found: string[] = []
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index)
    if (key !== null && nightCacheKeyParts(key)) found.push(key)
  }
  return found
}

// A night ends at 04:00 and takes its cache with it. Returns what it dropped, so a caller can say
// so; keys that are not ours are never touched.
export function pruneNightCache(store: NightCacheStore, night: string): string[] {
  const dropped = nightCacheKeysIn(store).filter(key => nightCacheKeyParts(key)!.night !== night)
  for (const key of dropped) store.removeItem(key)
  return dropped
}

// A failure leaves the last good night where it was and rejects, so the screen keeps rendering
// what it had (K-103 criterion 2). It answers even when the device refused to store the result.
export async function refreshNightCache<T>(store: NightCacheStore, key: string, loader: () => Promise<T>, at: Date = new Date()): Promise<NightCacheEntry<T>> {
  const data = await loader()
  const stored = writeNightCache(store, key, data, at)
  return stored ?? { key, night: nightCacheKeyParts(key)!.night, cachedAt: at.getTime(), data }
}

// The fallback when a device refuses storage, and what a test caches into. It lives as long as
// the tab, so a screen still holds its night while the app is open.
export function memoryNightCacheStore(): NightCacheStore {
  const held = new Map<string, string>()
  return {
    get length() {
      return held.size
    },
    key: index => [...held.keys()][index] ?? null,
    getItem: key => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value)
    },
    removeItem: (key) => {
      held.delete(key)
    },
  }
}
