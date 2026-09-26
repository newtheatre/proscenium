import { resolveAttemptForm } from '#shared/utils/sumup'
import { tillScopeForm } from '#shared/utils/till'

// "Did it go through?" answered by anyone holding bar authority tonight (F-124.3), at their own
// till, since every bar shares the one reader (issue 1308); the sale posts to the attempt's session.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, resolveAttemptForm)
  const scope = await getValidatedQueryOrThrow(event, tillScopeForm)

  const row = await attemptById(id)
  if (!row) throw noSuch('SumUp attempt')
  const resolved = await requireNightAuthority(event, 'BAR', scope.venueId ? scope : { venueId: row.venueId })

  const outcome = await resolveAttempt(row, input.outcome, input.smpTxCode, input.note, {
    actorId: resolved.account.id,
    resolution: 'STAFF',
    baseURL: useRuntimeConfig(event).public.baseURL,
    event,
  })

  return { ok: true, id, ...outcome }
})
