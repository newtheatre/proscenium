// `useFetch` for the site's own API: the same options and the same answer, sent through `$api`
// (plugins/api.ts), so a load refused with "confirm it is you" is confirmed in place and retried.
// `<unknown>`: each call still works out its answer from its own route. Left to the default, the
// factory works one out over every route at once, which passes the compiler's depth limit (TS2589).
export const useAPI = createUseFetch<unknown>(() => ({ $fetch: useNuxtApp().$api as unknown as typeof globalThis.$fetch }))
