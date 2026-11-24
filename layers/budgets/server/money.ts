// Money in a message, such as "£40.00", in the theatre's language.
import { useSetting } from '#kit'

export async function formatMoney(minor: number, currency: string): Promise<string> {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100) // not-policy: minor units to units; every currency offered has two decimals
}
