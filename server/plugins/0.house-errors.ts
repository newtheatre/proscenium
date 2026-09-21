import { registerHouseErrors } from '#shared/utils/house-errors'

// Before any request parses a body: a check with no message of its own must not reach a screen
// in zod's stock English (K-128 criterion 2).
export default defineNitroPlugin(() => {
  registerHouseErrors()
})
