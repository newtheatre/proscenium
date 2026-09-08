import { tillScopeForm } from '#shared/utils/till'
import { londonDayOf } from '#shared/utils/ledger'

// What the till may sell right now, one tile per product with a priced size (F-103 criterion 1).
export default defineEventHandler(async (event) => {
  const scope = await getValidatedQueryOrThrow(event, tillScopeForm)
  await requireNightAuthority(event, 'BAR', scope)

  return sellableCatalogue(londonDayOf(new Date()))
})
