import { tillScopeForm } from '#shared/utils/till'

// Whether tonight's till is open here, and who opened it. Guarded like the action itself, so
// asking the question already proves the authority to act on the answer (F-101 criterion 3).
export default defineEventHandler(async (event) => {
  const scope = await getValidatedQueryOrThrow(event, tillScopeForm)
  const resolved = await requireNightAuthority(event, 'BAR', scope)
  const session = await openSessionFor(resolved.venueId, resolved.night)

  return { night: resolved.night, venueId: resolved.venueId, session }
})
