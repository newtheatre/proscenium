// Corrects a mistake without editing history (FIN-03): the mirror image of a posting, linked to it.
// A posting is reversed once.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { reversePosting } from '../../../../ledger'

export default defineRoute({
  ability: 'finance.posting.correct',
  record: event => ['finance.posting', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}).strict(),
  idempotent: true,
}, async (_event, { record, unit }) => {
  const postingId = await reversePosting(unit, record!.id)
  unit.audit({ action: 'create', record: ['finance.posting', postingId], detail: { reverses: record!.id } })
  return { postingId }
})
