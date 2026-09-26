import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'
import type { Stocktake } from '#shared/utils/stocktakes'

// Who may enter counts: a holder of bar.write on any day, or tonight's confirmed bar shift inside
// its window, derived from the shift and never granted (0009, 0099).
export async function requireStocktakeCounter(event: H3Event): Promise<AccountRow> {
  const resolved = await authority(event)
  if (resolved.permissions.has('bar.write')) {
    await requireSecondFactorIfPrivileged(event, resolved)
    return resolved.account
  }
  return (await requireNightAuthority(event, 'BAR')).account
}

// Reading follows counting: the bar shift reads the stocktake it may count into, while it is open.
export async function requireStocktakeReader(event: H3Event, held: Stocktake | undefined): Promise<void> {
  const resolved = await authority(event)
  if (resolved.permissions.has('bar.read')) {
    await requireSecondFactorIfPrivileged(event, resolved)
    return
  }
  await requireNightAuthority(event, 'BAR')
  if (held && held.status !== 'OPEN') {
    throw createError({ statusCode: 403, statusMessage: 'The bar shift counts into an open stocktake; this one has been applied' })
  }
}
