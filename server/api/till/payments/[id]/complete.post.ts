import { completeAttemptForm } from '#shared/utils/sumup'

// The SumUp app's answer (F-124 criteria 3, 4). Accepted from a browser with no session when it
// carries the attempt's own signed key, otherwise under tonight's bar authority; never from nobody.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, completeAttemptForm)

  const row = await attemptById(id)
  if (!row) throw noSuch('SumUp attempt')
  if (input.foreignTxId && input.foreignTxId !== id) {
    throw createError({ statusCode: 400, statusMessage: 'That answer is for a different attempt' })
  }

  let actorId: string | null = null
  let resolution: 'KEY' | 'CALLBACK' = 'KEY'
  const keyed = input.key ? await verifyAttemptKey(input.key) : null
  if (keyed !== id) {
    const resolved = await requireNightAuthority(event, 'BAR', { venueId: row.venueId })
    actorId = resolved.account.id
    resolution = 'CALLBACK'
  }

  const outcome = await completeAttempt(row, input, {
    actorId,
    resolution,
    baseURL: useRuntimeConfig(event).public.baseURL,
    event,
  })

  // The figure the app was asked for, so a replayed answer can still say what was recorded; the
  // venue, so the way back opens this bar in a tab that never had it (issue 1257).
  return { ok: true, id, venueId: row.venueId, totalPence: row.expectedTotalPence, ...outcome }
})
