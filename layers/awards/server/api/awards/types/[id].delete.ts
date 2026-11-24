// Deletes an award type nobody has ever held. One that has been given is archived instead.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireType } from '../../../types'

export default defineRoute({ ability: 'awards.type.manage', record: event => ['awards.type', getRouterParam(event, 'id', { decode: true })], rateLimit: 'write', input: z.object({}) }, async (_event, { record, unit }) => {
  const type = await requireType(record!.id)
  unit.add({ sql: 'DELETE FROM awards_types WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM awards_awards WHERE type_id = ?1)', params: [type.id] })
    .expect(1, { code: 'awards.type.not-deletable', reason: `${type.name} has been given, so it cannot be deleted.`, remedy: 'Archive it instead.' })
  unit.audit({ action: 'delete', record: ['awards.type', type.id] })
  return { deleted: true }
})
