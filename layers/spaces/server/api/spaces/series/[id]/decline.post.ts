// Declines every date of a series still waiting, at once, with a note the booker is sent (SP-29, A7).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { notify } from '#modules/core'
import { declineSeries } from '../../../../series'
import { seriesWords } from '../../../../words'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ note: z.string().max(500).nullish() }).strict(), // not-policy: as the table's CHECK
}, async (event, { actor, input, unit }) => {
  const id = getRouterParam(event, 'id')!
  const words = await seriesWords(id)
  const done = await declineSeries(unit.view(), actor, id, input.note ?? null)
  await notify(unit.view(), 'spaces.request-declined', { to: done.bookedFor, variables: { ...words, note: input.note!.trim() }, dedupeKey: `series-decided:${id}` })
  return { declined: done.declined }
})
