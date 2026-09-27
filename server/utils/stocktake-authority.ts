import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'
import type { Permission } from '#shared/utils/roles'
import type { Stocktake } from '#shared/utils/stocktakes'

// Somebody who reaches a stocktake through tonight's bar shift counts blind (issue 1321, 0099).
export interface StocktakeCaller { account: AccountRow, blind: boolean }

// The standing grant first, then tonight's confirmed bar shift: a shift carries no second-factor
// gate (0044), so a holder with no authenticator still counts through it, as the till lets them sell.
async function stocktakeCaller(event: H3Event, grants: (held: Set<Permission>) => boolean): Promise<StocktakeCaller> {
  const resolved = await authority(event)
  const throughShift = async (): Promise<StocktakeCaller> => ({ account: (await requireNightAuthority(event, 'BAR')).account, blind: true })
  if (!grants(resolved.permissions)) return throughShift()
  try {
    await requireSecondFactorIfPrivileged(event, resolved)
    return { account: resolved.account, blind: false }
  }
  catch (refused) {
    return throughShift().catch(() => {
      throw refused
    })
  }
}

// Who may enter counts: a holder of bar.stocktake on any day, or tonight's confirmed bar shift inside
// its window, derived from the shift and never granted (0009, 0099).
export const requireStocktakeCounter = (event: H3Event): Promise<StocktakeCaller> =>
  stocktakeCaller(event, held => held.has('bar.stocktake'))

// Reading follows counting: the bar shift reads the stocktake it may count into, while it is open.
export async function requireStocktakeReader(event: H3Event, held: Stocktake | undefined): Promise<StocktakeCaller> {
  const caller = await stocktakeCaller(event, permissions => permissions.has('bar.read') || permissions.has('bar.stocktake'))
  if (caller.blind && held && held.status !== 'OPEN') {
    throw createError({ statusCode: 403, statusMessage: 'The bar shift counts into an open stocktake; this one has been applied' })
  }
  return caller
}
