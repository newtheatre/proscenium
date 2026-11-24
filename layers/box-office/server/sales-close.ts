import { useSetting } from '#kit'

/** When online sales close: the time set on the sales record, or the setting's time before curtain. */
export async function offSaleAt(sales: { offSaleAt: number | null }, startsAt: number): Promise<number> {
  return sales.offSaleAt ?? startsAt - (await useSetting('box-office.sales.close-before') as number) * 1000 // not-policy: seconds to milliseconds
}
