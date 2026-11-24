// A gift's amount and date as the thanks email says them, in the theatre's own language.
import { useSetting } from '#kit'

export async function wordsFor(amountMinor: number, currency: string, day: string): Promise<{ amount: string, date: string }> {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  // A local date has no time, so it is read at noon in UTC and no time zone moves it.
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
  return { amount: new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100), date } // not-policy: minor units to units
}
