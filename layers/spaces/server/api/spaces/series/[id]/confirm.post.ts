// Confirms every date of a series still waiting, at once (SP-29, rule A7). The booker is told once.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { notify } from '#modules/core'
import { confirmSeries } from '../../../../series'
import { noNote, seriesWords } from '../../../../words'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ note: z.string().trim().max(500).nullish() }).strict(), // not-policy: as the table's CHECK
}, async (event, { actor, input, unit }) => {
  const id = getRouterParam(event, 'id')!
  const words = await seriesWords(id)
  const done = await confirmSeries(unit.view(), actor, id, input.note || null)
  await notify(unit.view(), 'spaces.request-confirmed', { to: done.bookedFor, variables: { ...words, note: input.note || noNote() }, dedupeKey: `series-decided:${id}` })
  return { confirmed: done.confirmed }
})
