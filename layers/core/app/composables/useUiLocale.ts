// Nuxt UI's locale for the theatre's language: it sets the order and clock of the date and time
// controls, the text direction, and the component library's own words ("Close", "No results").
import * as locales from '@nuxt/ui/locale'
import type { Locale, Messages } from '@nuxt/ui'

export function useUiLocale() {
  const { data: settings } = usePublicSettings()
  return computed<Locale<Messages>>(() => {
    const language = ((settings.value?.['core.locale.language']?.value as string | undefined) || 'en-GB').toLowerCase()
    const all = locales as unknown as Record<string, Locale<Messages> | undefined>
    return all[language.replace(/-/g, '_')] ?? all[language.split('-')[0]!] ?? locales.en_gb
  })
}
