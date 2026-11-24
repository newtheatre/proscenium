// The Worker's bindings and execution context, read from the request as Nitro v3 documents:
// `event.req.runtime.cloudflare`. Absent while prerendering, which has no database.
import type { KitEnv } from './context'

interface CloudflareRuntime { env?: KitEnv, context?: { waitUntil(promise: Promise<unknown>): void } }

function runtimeOf(event: unknown): CloudflareRuntime | undefined {
  return (event as { req?: { runtime?: { cloudflare?: CloudflareRuntime } } } | undefined)?.req?.runtime?.cloudflare
}

export function bindings(event: unknown): KitEnv | undefined {
  const env = runtimeOf(event)?.env
  return env?.DB ? env : undefined
}

export function waitUntilOf(event: unknown): ((promise: Promise<unknown>) => void) | undefined {
  const context = runtimeOf(event)?.context
  return context ? promise => context.waitUntil(promise) : undefined
}
