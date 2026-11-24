// An act on the server from a Training screen. Training's writing routes are idempotent, so each
// act carries an Idempotency-Key of its own.
import type { FetchOptions, ResponseType } from 'ofetch'

export function useTrainingAct() {
  const { $api } = useNuxtApp()
  return <T = unknown>(path: string, options: FetchOptions<ResponseType> & { method: string }) =>
    $api<T>(path, { ...options, headers: { ...(options.headers as Record<string, string> | undefined), 'idempotency-key': crypto.randomUUID() } })
}
