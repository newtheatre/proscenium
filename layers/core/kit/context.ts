// The ambient context of one request, job, task or test: the bindings, who is acting, the clock
// and the per-request caches (settings and module states are read once per request).
import { storage, currentContext } from './context-store'

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
  CORE_ENCRYPTION_KEY?: string
  CORE_TURNSTILE_SECRET_KEY?: string
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
}

export function runInContext<T>(context: Partial<KitContext> & { env: KitEnv }, fn: () => T): T {
  const parent = currentContext()
  const full: KitContext = {
    requestId: context.requestId ?? parent?.requestId ?? crypto.randomUUID(),
    actor: context.actor ?? parent?.actor ?? ANONYMOUS,
    clock: context.clock ?? parent?.clock,
    waitUntil: context.waitUntil ?? parent?.waitUntil,
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

/** Forget what this request has read, after it changes settings or module states itself. */
export function forgetCached(...keys: ('settings' | 'modules')[]): void {
  const cache = currentContext()?.cache
  if (cache) for (const key of keys) cache[key] = undefined
}

export { currentContext }
