// Money in a message, such as "£40.00", in the theatre's language.
import { useSetting } from '#kit'

export async function formatMoney(minor: number, currency: string): Promise<string> {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100) // not-policy: minor units to units; every currency offered has two decimals
}

/** Minor units as a plain major figure for a spreadsheet, "40.00", in the currency's own digits. */
export function major(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2 // not-policy: a currency's own digits
  return (minor / 10 ** digits).toFixed(digits) // not-policy: minor units to major
}
