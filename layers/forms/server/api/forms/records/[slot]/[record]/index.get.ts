// A record's custom fields (FB-503): each set attached to the slot, as published, with what this
// record has in them. For whoever may edit the record, by the host module's own ability.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, isRefusal, today } from '#kit'
import { fieldsOf, mayEdit } from '../../../../../records'
import { requireSlot } from '../../../../../slots'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const slot = await requireSlot(getRouterParam(event, 'slot', { decode: true }))
  const recordId = getRouterParam(event, 'record', { decode: true })!
  await mayEdit(actor, slot, recordId)
  const day = await today().catch((error) => {
    if (isRefusal(error)) return null
    throw error
  })
  const sets = await fieldsOf(slot, recordId)
  return { today: day, sets: sets.map(s => ({ formId: s.formId, title: s.title, version: s.version, definition: s.definition, answers: s.answers, revision: s.revision, updatedAt: s.updatedAt })) }
})
