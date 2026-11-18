// Nuxt UI's locale for the theatre's language: it sets the order and clock of the date and time
// controls, the text direction, and the component library's own words ("Close", "No results").
// Words a screen reader hears that the library's catalogue says badly ("pin input 1 of 6") are
// replaced from the site's own catalogue, so they read as the rest of the site does.
import * as locales from '@nuxt/ui/locale'
import type { Locale, Messages } from '@nuxt/ui'

export function useUiLocale() {
  const { data: settings } = usePublicSettings()
  const { t } = useT()
  return computed<Locale<Messages>>(() => {
    const language = ((settings.value?.['core.locale.language']?.value as string | undefined) || 'en-GB').toLowerCase()
    const all = locales as unknown as Record<string, Locale<Messages> | undefined>
    const found = all[language.replace(/-/g, '_')] ?? all[language.split('-')[0]!] ?? locales.en_gb
    // `{index}` and `{length}` are left in for the library to fill.
    return { ...found, messages: { ...found.messages, pinInput: { ...found.messages.pinInput, input: t('core.ui.pin-input') } } }
  })
}
