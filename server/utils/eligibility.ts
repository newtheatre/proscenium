/**
 * Training eligibility, read from rehearsal behind one seam (ADR-0026). The
 * rota never encodes what a rule requires, only that there is one.
 */

/** Advisory-fresh, never transactional: rehearsal's own guidance. */
const CACHE_TTL_MS = 5 * 60 * 1000

export type EligibilityRule = 'duty-manager' | 'door' | 'bar'

export interface EligibilityAnswer {
  eligible: boolean
  /** Module codes they are missing, when rehearsal could tell us. */
  missing: string[]
  /**
   * True when the API could not be reached and no cached answer existed, so
   * this is the fail-open path and a human should confirm (ADR-0026).
   */
  needsReview: boolean
}

interface CacheEntry { answer: EligibilityAnswer, at: number }

// Per-isolate, which is enough: this exists to avoid hammering rehearsal
// inside a burst, not to be a shared cache.
const cache = new Map<string, CacheEntry>()

function cacheKey(userId: string, rule: string) {
  return `${rule}:${userId}`
}

/**
 * The one place this app asks whether someone is trained. Never throws for a
 * transport failure: it degrades in the direction ADR-0026 chose.
 */
export async function isEligible(userId: string, rule: EligibilityRule): Promise<EligibilityAnswer> {
  const key = cacheKey(userId, rule)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.answer

  const config = useRuntimeConfig()
  const token = config.trainingApiToken
  const base = config.trainingApiBaseURL

  if (!token) {
    // No token yet is the same shape as an outage, and takes the same path.
    return failOpen(hit)
  }

  try {
    const response = await $fetch<{ eligible: boolean, missing?: string[] }>(
      `${base}/api/v1/eligibility/${rule}`,
      { query: { userId }, headers: { Authorization: `Bearer ${token}` }, timeout: 4000 },
    )
    const answer: EligibilityAnswer = {
      eligible: response.eligible,
      missing: response.missing ?? [],
      needsReview: false,
    }
    cache.set(key, { answer, at: Date.now() })
    return answer
  }
  catch (error) {
    const status = (error as { statusCode?: number, response?: { status?: number } }).statusCode
      ?? (error as { response?: { status?: number } }).response?.status

    // A renamed or deleted rule is a configuration break, not a transient, and
    // must be loud rather than quietly fail-open (ADR-0026).
    if (status === 404) {
      console.error(`[eligibility] rehearsal has no rule "${rule}": someone renamed or removed it`)
    }
    else {
      console.error(`[eligibility] could not reach rehearsal for "${rule}":`, error)
    }
    return failOpen(hit)
  }
}

/**
 * Allow, and flag it. Failing closed would empty the rota during a training
 * outage, and an unstaffed performance is a real harm tonight (ADR-0026).
 */
function failOpen(stale: CacheEntry | undefined): EligibilityAnswer {
  if (stale) return stale.answer
  return { eligible: true, missing: [], needsReview: true }
}

/** Testing seam: the cache is per-isolate and otherwise invisible. */
export function clearEligibilityCache() {
  cache.clear()
}
