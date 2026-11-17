// `useFetch` for the site's own API: the same options and the same answer, sent through `$api`
// (plugins/api.ts), so a load refused with "confirm it is you" is confirmed in place and retried.
// Typed loosely over the address, so the compiler does not compare every route of the app: the caller
// says what it expects back, `useAPI<{ rows: Row[] }>('/api/...')`.
import type { AsyncData, UseFetchOptions } from '#app'
import type { FetchError } from 'ofetch'
import type { MaybeRefOrGetter } from 'vue'

export type UseAPIOptions<T> = Omit<UseFetchOptions<T>, 'default'> & { default?: () => T }
type UseAPI = <T = unknown>(request: MaybeRefOrGetter<string>, options?: UseAPIOptions<T>) => AsyncData<T, FetchError>

// It stays `export const … = createUseFetch(…)`, the form Nuxt's build recognises. The compiler is told to
// leave the line: inferring over every route of the app is what overflows ("excessively deep").
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- an expect-error would itself fail while the app has few routes
// @ts-ignore TS2589: the typed-route union of createUseFetch outgrows the compiler
export const useAPI: UseAPI = createUseFetch(() => ({ $fetch: useNuxtApp().$api }))
