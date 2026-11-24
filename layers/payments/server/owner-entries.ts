// An owner's entries as Payments posts them: on the owner's behalf, with any VAT inside a price split
// out onto Finance's VAT account (FIN-07). Sales and refunds are output VAT; money paid out is input.
import { splitVat, type EntryInput } from '#modules/finance'
import type { OwnerEntry } from './points/settlement'

export function ownerEntries(own: readonly OwnerEntry[], module: string, side: 'output' | 'input' = 'output'): Promise<EntryInput[]> {
  return splitVat(own.map(e => ({ account: e.account, amountMinor: e.amountMinor, forModule: module, productionId: e.productionId ?? null, performanceId: e.performanceId ?? null, taxCode: e.taxCode })), side)
}
