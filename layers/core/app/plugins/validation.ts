// Every schema a form checks with speaks plainly, in the words the server uses for the same value
// (shared/validation.ts).
import { installValidationMessages } from '../../shared/validation'

export default defineNuxtPlugin(() => {
  installValidationMessages(translate)
})
