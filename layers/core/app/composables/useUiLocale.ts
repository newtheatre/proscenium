// Nuxt UI's locale for the theatre's language: it sets the order and clock of the date and time
// controls, the text direction, and the component library's own words ("Close", "No results").
// Words a person hears that Nuxt UI only has in its own catalogue go through t() here instead.
import * as locales from '@nuxt/ui/locale'
import type { Locale, Messages } from '@nuxt/ui'

export function useUiLocale() {
  const { t } = useT()
  const { data: settings } = usePublicSettings()
  return computed<Locale<Messages>>(() => {
    const language = ((settings.value?.['core.locale.language']?.value as string | undefined) || 'en-GB').toLowerCase()
    const all = locales as unknown as Record<string, Locale<Messages> | undefined>
    const base = all[language.replace(/-/g, '_')] ?? all[language.split('-')[0]!] ?? locales.en_gb
    // Each box of a code is "Digit 1 of 6" rather than Nuxt UI's "pin input 1 of 6". Left with its
    // placeholders, which Nuxt UI fills in.
    return { ...base, messages: { ...base.messages, pinInput: { ...base.messages.pinInput, input: t('core.ui.pin-input') } } }
  })
}
