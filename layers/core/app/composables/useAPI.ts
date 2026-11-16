// `useFetch` for the site's own API: the same options and the same answer, sent through `$api`
// (plugins/api.ts), so a load refused with "confirm it is you" is confirmed in place and retried.
export const useAPI = createUseFetch(() => ({ $fetch: useNuxtApp().$api }))
