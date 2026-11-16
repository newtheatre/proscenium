// The fixture module's strings. It lives outside the module folders the app reads catalogues
// from, so that no build but the browser tests' carries them; it adds its own here.
import catalogue from '../../i18n/en-GB.json'
import { addMessages } from '../../../../../../layers/core/app/utils/translate'

export default defineNuxtPlugin(() => {
  addMessages(catalogue)
})
