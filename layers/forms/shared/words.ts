// Words shared by the screens and the server for showing an answer.

/** Money as people read it: "£480.00" from 48000 of the currency's minor unit. */
export function moneyWords(minor: number, currency: string): string {
  const format = new Intl.NumberFormat('en-GB', { style: 'currency', currency })
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2)) // not-policy: minor units to units
}
