import { resolveAttemptForm } from '#shared/utils/sumup'

// "Did it go through?" answered by a person (F-124 criterion 5): the same bar authority the sale
// itself needs, because this is the tap on "charged" the typed flow always trusted.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, resolveAttemptForm)

  const row = await attemptById(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'No such SumUp attempt' })
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: row.venueId })

  const outcome = await resolveAttempt(row, input.outcome, input.smpTxCode, input.note, {
    actorId: resolved.account.id,
    resolution: 'STAFF',
    baseURL: useRuntimeConfig(event).public.baseURL,
    event,
  })

  return { ok: true, id, ...outcome }
})
