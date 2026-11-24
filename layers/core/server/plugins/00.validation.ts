// The server answers a schema's problems in the words the form shows (shared/validation.ts), so a
// refusal's `fields` read the same as the message beside the field.
import { definePlugin as defineNitroPlugin } from 'nitro'
import { installValidationMessages } from '../../shared/validation'
import { wordsFrom } from '../../kit/words'
import messages from '../../i18n/en-GB/validation.json'

const translate = wordsFrom(messages as Record<string, string>)

export default defineNitroPlugin(() => {
  installValidationMessages(translate)
})
