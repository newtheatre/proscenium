// The ambient context of one request, job, task or test: the bindings, who is acting, the clock
// and the per-request caches (settings and module states are read once per request).
import { storage, currentContext } from './context-store'
import type { PracticeSession } from './practice/gate'

export interface KitEnv {
  DB: D1Database
  FILES?: R2Bucket
  CACHE?: KVNamespace
  JOBS_PROMPT?: Queue
  JOBS_BULK?: Queue
  /** Cloudflare Email Sending's outcome events (bounced, complained, delivered and so on). */
  EMAIL_EVENTS?: Queue
  /** Cloudflare Email Sending. Only core's mailer touches it. */
  EMAIL?: SendEmail
  /** The shared rate-limit counts (RateLimitCounter). Absent under nuxt dev, where they count in memory. */
  RATE_LIMITS?: DurableObjectNamespace
  /** The realtime rooms (RealtimeHub). Absent under nuxt dev, where pages keep asking instead. */
  REALTIME?: DurableObjectNamespace
  /** Each person's practice store (PracticeStore). Practice mode is unavailable without it. */
  PRACTICE?: DurableObjectNamespace
  CORE_SESSION_KEY?: string
  CORE_ENCRYPTION_KEY?: string
  CORE_TURNSTILE_SECRET_KEY?: string
  /** The site's origin when the recorded one is lost: prevails over core.site.origin. A plain variable. */
  CORE_SITE_ORIGIN?: string
  /** "1" applies pending migrations on the first request. Set by dev, preview and tests only. */
  PROSCENIUM_AUTO_MIGRATE?: string
  [binding: string]: unknown
}

export interface Grant {
  /** One ability, or every ability of a module when `module` is given instead. */
  ability?: string
  module?: string
  /** A grant on a record covers it and every record beneath it. */
  record?: { type: string, id: string }
  /** What gave it, recorded on audit rows as allowed_by: `role:<id>`, `grant:<id>`. */
  via: string
}

export interface Actor {
  kind: 'anonymous' | 'person' | 'system' | 'job' | 'setup'
  accountId?: string
  /** For audit only; never logged. */
  name?: string
  grants?: Grant[]
  /** Facts this actor is known to hold, when the access provider resolves them up front. */
  facts?: string[]
  assurance?: 'basic' | 'strong'
  /** When the person last re-asserted who they are, in UTC milliseconds. */
  reassertedAt?: number
  /** The sign-in session the request came with, so identity need not look it up again. */
  sessionId?: string
}

export const ANONYMOUS: Actor = { kind: 'anonymous' }
export const SYSTEM: Actor = { kind: 'system' }

export interface KitContext {
  env: KitEnv
  requestId: string
  actor: Actor
  clock?: () => number
  waitUntil?: (promise: Promise<unknown>) => void
  /** Per-request caches. */
  cache: { settings?: Promise<Map<string, unknown>>, modules?: Promise<Map<string, boolean>>, [key: string]: unknown }
  /** Set by a route once its permission check passes, and copied to every audit row. */
  ability?: string
  allowedBy?: string
  module?: string
  /** The caller's network address, set by a route; keys the presented-value rate limit. */
  address?: string
  /** The origin the request arrived on, which stands in for the site's until one is recorded. */
  requestOrigin?: string
  /** Link tokens in the request's address (path parameters the route declares as tokens). */
  tokens?: readonly string[]
  /**
   * Set by a route answering a GET or HEAD. A read never asks to confirm it is you, whatever the
   * ability says; only a change does (Matt, 17 November). See `can`.
   */
  reads?: boolean
  /** Set when the request runs in a practice store (Practice mode): the bindings are the store's. */
  practice?: PracticeSession
}

export function runInContext<T>(context: Partial<KitContext> & { env: KitEnv }, fn: () => T): T {
  const parent = currentContext()
  const full: KitContext = {
    requestId: context.requestId ?? parent?.requestId ?? crypto.randomUUID(),
    actor: context.actor ?? parent?.actor ?? ANONYMOUS,
    clock: context.clock ?? parent?.clock,
    waitUntil: context.waitUntil ?? parent?.waitUntil,
    // A practice session goes with its store's bindings, never with any other.
    practice: context.practice ?? (parent && context.env === parent.env ? parent.practice : undefined),
    cache: context.cache ?? {},
    ...context,
  } as KitContext
  return storage.run(full, fn)
}

export function useContext(): KitContext {
  const context = currentContext()
  if (!context) throw new Error('No kit context: this code must run inside a route, a job, a task or runInContext()')
  return context
}

export function useEnv(): KitEnv {
  return useContext().env
}

export { currentContext }
