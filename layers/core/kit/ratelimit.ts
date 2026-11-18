// Rate limits (F-36). Each route declares its class; each class's allowance is the core setting
// core.rate-limits.<class>, a count in a period. The classes that guard against guessing and
// flooding count in one place shared by every copy of the Worker (the RateLimitCounter Durable
// Object, binding RATE_LIMITS); the rest count in each Worker instance, which is enough to stop one
// caller hammering one instance and costs nothing per request.
//
// Cloudflare's rate limiting binding was evaluated first and not used: its period is fixed at
// deploy to 10 or 60 seconds, so it cannot follow a setting such as "10 in 10 minutes", and its
// counts are approximate and kept separately at each Cloudflare location.
import { useSetting } from './settings-store'
import { useEnv } from './context'
import { nowMs } from './clock'
import type { Rate } from './settings'

// presented-value counts checks that carry a value a person typed (a membership number, a code).
// Signing in by email counts three ways apart, so one cannot use up another: sign-in-network for
// each network address on the public sign-in routes (high, as a students' union or halls network
// shares one address), sign-in-link for each email address asking for a link, and sign-in-code for
// each email address trying a code. sign-in is the class of the other identity routes.
export const RATE_CLASSES = ['default', 'write', 'sign-in', 'sign-in-network', 'sign-in-link', 'sign-in-code', 'public-form', 'export', 'presented-value'] as const
export type RateClass = typeof RATE_CLASSES[number]

/** Classes counted in the shared store, shared by every instance. */
export const SHARED_RATE_CLASSES: ReadonlySet<string> = new Set(['sign-in', 'sign-in-network', 'sign-in-link', 'sign-in-code', 'public-form', 'presented-value'])

export interface RateDecision {
  allowed: boolean
  /** Whole seconds until the window this caller is in ends. */
  retryAfter: number
}

/** Where counts are kept. `at` and the answer are in UTC milliseconds. */
export interface RateStore {
  take(key: string, limit: Rate, at: number): Promise<{ allowed: boolean, resets: number }>
}

/** The shape of the RateLimitCounter Durable Object's RPC, so the kit need not import it. */
interface CounterStub {
  take(limit: Rate, at: number): Promise<{ allowed: boolean, resets: number }>
}
interface CounterNamespace {
  idFromName(name: string): unknown
  get(id: unknown): CounterStub
}

/** Counts in this Worker instance only: fixed windows in a map. */
export function memoryRateStore(): RateStore {
  const windows = new Map<string, { count: number, resets: number }>()
  return {
    async take(key, limit, at) {
      const current = windows.get(key)
      if (!current || current.resets <= at) {
        const resets = at + limit.per * 1000 // not-policy: seconds to milliseconds
        windows.set(key, { count: 1, resets })
        if (windows.size > 10_000) for (const [k, w] of windows) if (w.resets <= at) windows.delete(k) // not-policy: memory bound
        return { allowed: limit.count >= 1, resets }
      }
      current.count++
      return { allowed: current.count <= limit.count, resets: current.resets }
    },
  }
}

/** Counts in the RateLimitCounter Durable Object: one object for each class and caller. */
export function sharedRateStore(namespace: CounterNamespace): RateStore {
  return {
    take(key, limit, at) {
      return namespace.get(namespace.idFromName(`${generation}:${key}`)).take(limit, at)
    },
  }
}

let local = memoryRateStore()
let generation = 0

/** A rate setting's value. An override saved before F-36 is a whole number a minute. */
async function allowance(rateClass: string): Promise<Rate> {
  const value = await useSetting(`core.rate-limits.${rateClass}` as any) as Rate | number
  return typeof value === 'number' ? { count: value, per: 60 } : value // not-policy: the old settings were per minute
}

/**
 * Counts this request against the class's allowance for `who`, and says whether it is within it.
 * (Called takeRate before F-36, when it answered a bare boolean; renamed so no old caller can
 * mistake the decision for one.)
 */
export async function countAgainstRate(rateClass: RateClass, who: string): Promise<RateDecision> {
  const limit = await allowance(rateClass)
  const namespace = useEnv().RATE_LIMITS as CounterNamespace | undefined
  // Without the binding (nuxt dev) the shared classes count in memory too.
  const store = SHARED_RATE_CLASSES.has(rateClass) && namespace ? sharedRateStore(namespace) : local
  const at = nowMs()
  const { allowed, resets } = await store.take(`${rateClass}:${who}`, limit, at)
  return { allowed, retryAfter: Math.max(1, Math.ceil((resets - at) / 1000)) } // not-policy: milliseconds to whole seconds
}

/** How long to wait, for a refusal's remedy: "Try again in 4 minutes." */
export function waitRemedy(retryAfter: number): string {
  const minute = 60 // not-policy: seconds in a minute
  const hour = 3600 // not-policy: seconds in an hour
  const [n, unit] = retryAfter < minute
    ? [retryAfter, 'second']
    : retryAfter < hour ? [Math.ceil(retryAfter / minute), 'minute'] : [Math.ceil(retryAfter / hour), 'hour']
  return `Try again in ${n} ${unit}${n === 1 ? '' : 's'}.`
}

/** Tests only: forget every count, here and (by moving to fresh objects) in the shared store. */
export function resetRateLimits(): void {
  local = memoryRateStore()
  generation++
}
