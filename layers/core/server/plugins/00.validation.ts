// The server answers a schema's problems in the words the form shows (shared/validation.ts), so a
// refusal's `fields` read the same as the message beside the field.
import { defineNitroPlugin } from 'nitropack/runtime'
import { installValidationMessages } from '../../shared/validation'
import messages from '../../i18n/en-GB/validation.json'

const catalogue = messages as Record<string, string>

function translate(key: string, params: Record<string, string | number> = {}): string {
  let text = catalogue[key]
  if (typeof params.count === 'number') text = catalogue[`${key}.${params.count === 1 ? 'one' : 'other'}`] ?? text
  if (text === undefined) return key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}

export default defineNitroPlugin(() => {
  installValidationMessages(translate)
})
