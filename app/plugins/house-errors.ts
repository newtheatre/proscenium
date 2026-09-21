import { registerHouseErrors } from '#shared/utils/house-errors'

// The same map on the browser side, where a form validates against the shared schema before it
// ever reaches a route.
export default defineNuxtPlugin(() => {
  registerHouseErrors()
})
