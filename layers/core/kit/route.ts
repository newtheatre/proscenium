// defineRoute: the only way to write an API route (R1, R2, R6). Before the handler runs it checks
// the module is on, the rate limit, the challenge, the input and the permission; it opens the unit
// of work, commits it after the handler returns, and shapes every refusal the same way.
import { defineEventHandler, getHeader, getQuery, getRequestIP, readRawBody, setResponseHeader, setResponseStatus, type H3Event } from 'h3'
import type { z } from 'zod'
import { runInContext, useContext, type Actor, type KitEnv } from './context'
import { Refusal, isRefusal, DeclarationError, type RefusalBody } from './refusal'
import { useAccessProvider, can } from './access'
import { isEnabled } from './modules-store'
import { createUnit, type UnitOfWork } from './unit'
import { takeRate, RATE_CLASSES, type RateClass } from './ratelimit'
import { useRegistry } from './registry'
import { verifyTurnstile } from './turnstile'
import { nowMs } from './clock'
import { useSetting } from './settings-store'
import { ensureMigrated } from './migrations'
import type { AbilityName } from './registry-types'

export interface RouteDeclaration<I extends z.ZodType | undefined = undefined> {
  /** The ability the route requires, or 'signed-in' for any signed-in person. */
  ability?: AbilityName | 'signed-in'
  /** Says in so many words that anyone may call this route. */
  public?: true
  /** The record the ability is checked on. */
  record?: (event: H3Event) => readonly [string, string | undefined] | { type: string, id: string | undefined } | undefined
  rateLimit: RateClass
  /** Require a Turnstile challenge (quietly off when the theatre has not set the secret). */
  protect?: 'turnstile'
  /** Require an Idempotency-Key header and replay the stored response for a repeated key. */
  idempotent?: boolean
  /** The request body (or, for GET, the query) schema. With `body: 'binary'`, the query's. */
  input?: I
  /**
   * 'binary': the body is bytes the handler reads itself (readRawBody(event, false)), such as an
   * upload; the kit leaves it unread and validates the query instead. Cannot be idempotent.
   */
  body?: 'json' | 'binary'
}

export interface RouteContext<I> {
  input: I
  record: { type: string, id: string } | undefined
  actor: Actor
  /** The request's unit of work. The kit commits it after the handler returns. */
  unit: UnitOfWork
}

const ROUTE = Symbol.for('proscenium.route')

/** Validates a declaration. Exported so the conformance check can read the same rules. */
export function checkRouteDeclaration(decl: RouteDeclaration<any>): void {
  if (!decl || typeof decl !== 'object') throw new DeclarationError('defineRoute', 'takes a declaration first: { ability or public: true, rateLimit }')
  if (!decl.ability && decl.public !== true) throw new DeclarationError('ability', 'a route names the ability it requires, or says public: true in so many words')
  if (decl.ability && decl.public) throw new DeclarationError('public', 'a route is either public or requires an ability, not both')
  if (!RATE_CLASSES.includes(decl.rateLimit)) throw new DeclarationError('rateLimit', `is one of ${RATE_CLASSES.join(', ')}`)
  if (decl.protect !== undefined && decl.protect !== 'turnstile') throw new DeclarationError('protect', "is 'turnstile'")
  if (decl.body !== undefined && decl.body !== 'json' && decl.body !== 'binary') throw new DeclarationError('body', "is 'json' or 'binary'")
  if (decl.body === 'binary' && decl.idempotent) throw new DeclarationError('idempotent', 'a binary body is not kept, so it cannot be replayed')
}

function refusalResponse(event: H3Event, refusal: Refusal): RefusalBody {
  setResponseStatus(event, refusal.status)
  return refusal.toBody()
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function envOf(event: H3Event): KitEnv {
  const env = (event.context as any).cloudflare?.env
  if (!env?.DB) throw new Error('No DB binding on this request. Run under wrangler, nuxt dev with the Cloudflare preset, or a test worker')
  return env
}

function moduleOfPath(path: string): string | undefined {
  return /^\/api\/([a-z][a-z0-9-]*)(\/|$|\?)/.exec(path)?.[1]
}

/**
 * Declares an API route. A route with neither `ability` nor `public: true` fails the build (F-04);
 * a refused request gets the standard body `{ code, reason, remedy?, fields? }`.
 */
export function defineRoute<I extends z.ZodType | undefined = undefined, R = unknown>(
  decl: RouteDeclaration<I>,
  handler: (event: H3Event, context: RouteContext<I extends z.ZodType ? z.output<I> : undefined>) => Promise<R> | R,
) {
  checkRouteDeclaration(decl)
  const routeHandler = defineEventHandler(async (event) => {
    const env = envOf(event)
    const waitUntil = (event.context as any).cloudflare?.context?.waitUntil?.bind((event.context as any).cloudflare.context)
    return runInContext({ env, waitUntil, requestId: getHeader(event, 'cf-ray') ?? crypto.randomUUID() }, async () => {
      try {
        return await handle(event)
      }
      catch (error) {
        if (isRefusal(error)) return refusalResponse(event, error)
        throw error
      }
    })
  })

  async function handle(event: H3Event) {
    const context = useContext()
    await ensureMigrated()
    const registry = useRegistry()
    const module = moduleOfPath(event.path)
    if (!module || !registry.modules.has(module)) throw new Refusal('core.not-found', 'There is nothing here.', { status: 404 })
    context.module = module
    if (!(await isEnabled(module))) throw new Refusal('core.not-found', 'There is nothing here.', { status: 404 })

    const provider = useAccessProvider()
    const actor = await provider.actor(event)
    context.actor = actor

    const who = actor.accountId ?? getRequestIP(event, { xForwardedFor: true }) ?? getHeader(event, 'cf-connecting-ip') ?? 'unknown'
    if (!(await takeRate(decl.rateLimit, who))) {
      setResponseHeader(event, 'Retry-After', 60)
      throw new Refusal('core.rate-limit.reached', 'Too many requests. Please slow down.', { status: 429, remedy: 'Wait a minute, then try again.' })
    }

    const method = event.method.toUpperCase()
    const reads = method === 'GET' || method === 'HEAD'
    const binary = decl.body === 'binary'
    const rawBody = reads || binary ? '' : (await readRawBody(event, 'utf8')) ?? ''

    if (decl.protect === 'turnstile') {
      const token = getHeader(event, 'cf-turnstile-response')
      if (!(await verifyTurnstile(token, who))) throw new Refusal('core.challenge.failed', 'We could not confirm you are a person.', { status: 403, remedy: 'Complete the check, then try again.' })
    }

    let input: unknown
    if (decl.input) {
      let raw: unknown = reads || binary ? getQuery(event) : undefined
      if (!reads && !binary) {
        try { raw = rawBody ? JSON.parse(rawBody) : {} }
        catch { throw new Refusal('core.input.invalid', 'The request could not be read.', { status: 400 }) }
      }
      const parsed = decl.input.safeParse(raw)
      if (!parsed.success) {
        const fields: Record<string, string> = {}
        for (const issue of parsed.error.issues) fields[issue.path.join('.') || '(body)'] ??= issue.message
        throw new Refusal('core.input.invalid', 'Some of what was sent is not valid.', { status: 422, fields })
      }
      input = parsed.data
    }

    const declared = typeof decl.record === 'function' ? decl.record(event) : undefined
    const record = declared ? (Array.isArray(declared) ? { type: declared[0], id: declared[1] } : declared as { type: string, id: string | undefined }) : undefined
    if (record && !record.id) throw new Refusal('core.not-found', 'There is nothing here.', { status: 404 })

    if (decl.ability) {
      const decision = await can(actor, decl.ability, record as { type: string, id: string } | undefined)
      if (!decision.allowed) throw new Refusal(decision.code, decision.reason, { status: decision.status, remedy: decision.remedy })
      context.ability = decl.ability === 'signed-in' ? undefined : decl.ability
      context.allowedBy = decision.by
    }

    let idempotency: { key: string, route: string, hash: string } | undefined
    if (decl.idempotent) {
      const key = getHeader(event, 'idempotency-key')
      if (!key || key.length > 200) throw new Refusal('core.idempotency.key-missing', 'This request needs an Idempotency-Key header.', { status: 400 }) // not-policy: a sane header length
      const route = `${method} ${event.path.split('?')[0]}`
      const hash = await sha256(rawBody)
      const stored = await context.env.DB.prepare('SELECT request_hash, status, response, created_at FROM core_idempotency_keys WHERE key = ? AND route = ?').bind(key, route).first<{ request_hash: string, status: number, response: string, created_at: number }>()
      const keepFor = await useSetting('core.idempotency.keep-for') as number
      if (stored && stored.created_at > nowMs() - keepFor * 1000) { // not-policy: seconds to milliseconds
        if (stored.request_hash !== hash) throw new Refusal('core.idempotency.key-reused', 'This Idempotency-Key was already used for a different request.', { status: 422, remedy: 'Use a new key for a new request.' })
        setResponseStatus(event, stored.status)
        setResponseHeader(event, 'Idempotent-Replay', 'true')
        return JSON.parse(stored.response)
      }
      idempotency = { key, route, hash }
    }

    const unit = createUnit()
    const ability = decl.ability && decl.ability !== 'signed-in' ? registry.abilities.get(decl.ability)?.decl : undefined
    const result = await handler(event, { input: input as any, record: record as any, actor, unit })
    const body = result === undefined ? null : result

    if (!unit.committed) {
      // Using an audited ability writes an audit entry, even when the handler forgot to (and a
      // read under audit: 'read' is audited too).
      const writes = unit.size > 0
      if (ability && ((writes && ability.audit) || (reads && ability.audit === 'read')) && !(unit as any).items.some((i: any) => i.kind === 'audit'))
        unit.audit({ action: reads ? 'read' : method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update', record: record as any })
      if (idempotency) {
        unit.add({ sql: 'INSERT OR REPLACE INTO core_idempotency_keys (key, route, account_id, request_hash, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params: [idempotency.key, idempotency.route, actor.accountId ?? null, idempotency.hash, 200, JSON.stringify(body), nowMs()] }) // not-policy: HTTP OK
      }
      await unit.commit()
    }
    else if (idempotency) {
      await context.env.DB.prepare('INSERT OR REPLACE INTO core_idempotency_keys (key, route, account_id, request_hash, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(idempotency.key, idempotency.route, actor.accountId ?? null, idempotency.hash, 200, JSON.stringify(body), nowMs()).run() // not-policy: HTTP OK
    }
    return body
  }

  ;(routeHandler as any)[ROUTE] = decl
  return routeHandler
}

export function routeDeclaration(handler: unknown): RouteDeclaration<any> | undefined {
  return (handler as any)?.[ROUTE]
}
