import { env as workerEnv } from 'cloudflare:workers'
import { createApp, createRouter, getHeader, toWebHandler, type EventHandler } from 'h3'
import { runInContext, SYSTEM, type Actor, type KitEnv } from '#kit/context'
import type { AccessProvider } from '#kit/access'
import type { JobMessage } from '#kit/dispatch'
import { runJob } from '#kit/jobs'
import { newId } from '#kit/ids'

export const env = workerEnv as unknown as KitEnv & { DB: D1Database }

/** Job messages the kit would have sent to a queue. */
export const sent: JobMessage[] = []

/** Runs `fn` as the kit runs a request: with the env, an actor and a fresh per-request cache. */
export function inContext<T>(fn: () => Promise<T>, actor: Actor = SYSTEM): Promise<T> {
  return runInContext({ env, actor, cache: {}, requestId: newId('req') }, fn)
}

export async function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await env.DB.prepare(sql).bind(...params).all<T>()).results
}

/** Delivers every recorded message once, as the queue consumer would. */
export async function deliver(): Promise<string[]> {
  const outcomes: string[] = []
  while (sent.length) {
    const message = sent.shift()!
    outcomes.push(await inContext(() => runJob(message.jobId), { kind: 'job' }))
  }
  return outcomes
}

export async function setModule(id: string, on: boolean): Promise<void> {
  await env.DB.prepare('INSERT INTO core_modules (module_id, enabled) VALUES (?, ?) ON CONFLICT (module_id) DO UPDATE SET enabled = excluded.enabled').bind(id, on ? 1 : 0).run()
}

export async function performance(capacity = 10): Promise<string> {
  const id = newId('sp')
  await env.DB.prepare('INSERT INTO seats_performances (id, title, capacity, sold) VALUES (?, ?, ?, 0)').bind(id, 'Hamlet', capacity).run()
  return id
}

/** Tests say who is asking with an X-Test-Actor header holding the actor as JSON. */
export const testAccess: AccessProvider = {
  async actor(event) {
    const header = getHeader(event, 'x-test-actor')
    return header ? JSON.parse(header) as Actor : { kind: 'anonymous' }
  },
}

export function person(abilities: string[], extra: Partial<Actor> = {}): Actor {
  return { kind: 'person', accountId: newId('acc'), name: 'Test Person', assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(ability => ({ ability, via: 'role' })), ...extra } as Actor
}

/** A web handler over the given routes, with the test Worker's bindings as Nitro would pass them. */
export function server(routes: Record<string, EventHandler>): (request: Request) => Promise<Response> {
  const app = createApp({ onRequest(event) { event.context.cloudflare = { env } } })
  const router = createRouter()
  for (const [route, handler] of Object.entries(routes)) {
    const [method, path] = route.split(' ') as [string, string]
    router.add(path, handler, method.toLowerCase() as any)
  }
  app.use(router)
  return toWebHandler(app)
}

export function call(handle: (request: Request) => Promise<Response>, method: string, path: string, options: { actor?: Actor, body?: unknown, headers?: Record<string, string> } = {}) {
  // h3 builds the request URL from the Host header, so set it, or origin checks see localhost.
  const headers: Record<string, string> = { 'content-type': 'application/json', 'host': 'test', ...options.headers }
  if (options.actor) headers['x-test-actor'] = JSON.stringify(options.actor)
  return handle(new Request(`http://test${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }))
}
