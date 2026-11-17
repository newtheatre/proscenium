// `useFetch` for the site's own API: the same options and the same answer, sent through `$api`
// (plugins/api.ts), so a load refused with "confirm it is you" is confirmed in place and retried.
// `<unknown>`: left to the default, the factory works out an answer over every route at once, which
// passes the compiler's depth limit (TS2589). A screen names the answer's type where it needs one.
export const useAPI = createUseFetch<unknown>(() => ({ $fetch: useNuxtApp().$api as unknown as typeof globalThis.$fetch }))
