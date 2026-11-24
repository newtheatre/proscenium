// A gift's amount and date as the thanks email says them, in the theatre's own language.
import { useSetting } from '#kit'

const language = async () => (await useSetting('core.locale.language') as string | null) ?? 'en-GB'

export async function amountWords(amountMinor: number, currency: string): Promise<string> {
  return new Intl.NumberFormat(await language(), { style: 'currency', currency }).format(amountMinor / 100) // not-policy: minor units to units
}

export async function wordsFor(amountMinor: number, currency: string, day: string): Promise<{ amount: string, date: string }> {
  // A local date has no time, so it is read at noon in UTC and no time zone moves it.
  const date = new Intl.DateTimeFormat(await language(), { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
  return { amount: await amountWords(amountMinor, currency), date }
}
