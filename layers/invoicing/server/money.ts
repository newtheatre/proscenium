// Money and dates in a refusal, a message or a document, such as "£40.00" and "24 November 2026", in
// the theatre's language.
import { useSetting } from '#kit'

const language = async () => (await useSetting('core.locale.language') as string | null) ?? 'en-GB'

export async function formatMoney(minor: number, currency: string): Promise<string> {
  return new Intl.NumberFormat(await language(), { style: 'currency', currency }).format(minor / 100) // not-policy: minor units to units; every currency offered has two decimals
}

/** A theatre-local date ("2026-11-24") as words; the date has no time, so no time zone moves it. */
export async function formatDay(date: string): Promise<string> {
  return new Intl.DateTimeFormat(await language(), { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}
