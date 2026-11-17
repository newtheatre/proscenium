// An act on the server from a front of house screen. Every writing route of front of house is
// idempotent (live screens may retry a write), so each act carries an Idempotency-Key of its own.
import type { FetchOptions, ResponseType } from 'ofetch'

export function useAct() {
  const { $api } = useNuxtApp()
  return <T = unknown>(path: string, options: FetchOptions<ResponseType> & { method: string }) =>
    $api<T>(path, { ...options, headers: { ...(options.headers as Record<string, string> | undefined), 'idempotency-key': crypto.randomUUID() } })
}
