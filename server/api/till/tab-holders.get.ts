import { tillScopeForm } from '#shared/utils/till'

// Who the till may charge a sale to instead of the reader (F-108).
export default defineEventHandler(async (event) => {
  const scope = await getValidatedQueryOrThrow(event, tillScopeForm)
  await requireNightAuthority(event, 'BAR', scope)

  return { holders: await authorisedTabHolders(event) }
})
