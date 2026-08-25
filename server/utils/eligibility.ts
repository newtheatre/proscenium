/**
 * Everything this app asks rehearsal, in one file (ADR-0026). Two questions
 * with opposite failure directions: read the comments before changing either.
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
 * Sandboxes this app can open. rehearsal owns which modules unlock each one,
 * so a catalogue renumbering never touches this repo (its ADR-0014).
 */
export type PracticeTarget = 'bar-till' | 'challenge-25' | 'door-scan'

/**
 * CLOSED is rehearsal's answer; UNREACHABLE is no answer at all. Opening a
 * sandbox needs OPEN, but only CLOSED may end one (ADR-0033).
 */
export type PracticeStatus = 'OPEN' | 'CLOSED' | 'UNREACHABLE'

export interface PracticeAnswer {
  status: PracticeStatus
  active: boolean
  /** When the sandbox must shut, straight from rehearsal. */
  expiresAt: string | null
  /** The training session behind it, for the trail. Null for an ad-hoc grant. */
  sessionId: string | null
}

const CLOSED: PracticeAnswer = { status: 'CLOSED', active: false, expiresAt: null, sessionId: null }
const UNREACHABLE: PracticeAnswer = { status: 'UNREACHABLE', active: false, expiresAt: null, sessionId: null }

/**
 * Is this person being taught this, right now? **Fails closed** and is never
 * cached, unlike isEligible above (ADR-0033).
 */
export async function practiceWindow(userId: string, target: PracticeTarget): Promise<PracticeAnswer> {
  const config = useRuntimeConfig()
  const token = config.trainingApiToken

  // No token is no answer, not a closure: it refuses to open a sandbox, and
  // never ends one already open (ADR-0034).
  if (!token) return UNREACHABLE

  try {
    const response = await $fetch<{ active: boolean, expiresAt?: string | null, sessionId?: string | null }>(
      `${config.trainingApiBaseURL}/api/v1/practice/${target}`,
      { query: { userId }, headers: { Authorization: `Bearer ${token}` }, timeout: 4000 },
    )
    if (!response.active) return CLOSED

    return {
      status: 'OPEN',
      active: true,
      expiresAt: response.expiresAt ?? null,
      sessionId: response.sessionId ?? null,
    }
  }
  catch (error) {
    const status = (error as { statusCode?: number, response?: { status?: number } }).statusCode
      ?? (error as { response?: { status?: number } }).response?.status

    // A retired or renamed target is a definitive "no such sandbox", and a
    // configuration break across two repos, so it is loud.
    if (status === 404) {
      console.error(`[practice] rehearsal has no active target "${target}": someone renamed or retired it`)
      return CLOSED
    }

    // No answer at all. Refusing to open costs a trainee an evening (ADR-0033),
    // but ending a run already open on this would be destructive.
    console.error(`[practice] could not reach rehearsal for "${target}":`, error)
    return UNREACHABLE
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
