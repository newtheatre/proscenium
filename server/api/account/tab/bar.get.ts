import { londonDayOf } from '#shared/utils/ledger'
import { selfServeCatalogue } from '#shared/utils/self-tab'

// What a holder may add to their own tab tonight, and at which bars (F-108 criterion 7, 0165).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireOwnTabHolder(event, account.id)
  const night = currentShowNight()
  const bars = await barsOpenTonight(night)
  const catalogue = bars.length > 0 ? selfServeCatalogue(await sellableCatalogue(londonDayOf(new Date()))) : null
  return { ok: true, night, bars, catalogue }
})
