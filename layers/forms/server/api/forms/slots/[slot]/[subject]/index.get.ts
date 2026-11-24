// The forms attached to one record in a slot, for whoever looks after that record: what is
// attached, on what terms, and the published forms that could be.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { listForms } from '../../../../../forms'
import { attachedTo, mayAttach, modeOf, requireSlot } from '../../../../../slots'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const slot = await requireSlot(getRouterParam(event, 'slot', { decode: true }))
  const subjectId = getRouterParam(event, 'subject', { decode: true })!
  await mayAttach(actor, slot, subjectId)
  const attached = await attachedTo(slot.id, subjectId)
  const taken = new Set(attached.map(a => a.formId))
  const forms = (await listForms()).filter(f => f.liveVersionId && f.status !== 'archived' && f.mode === modeOf(slot) && !taken.has(f.id))
  return { slot: { id: slot.id, label: slot.label, limit: slot.limit ?? 1, mode: modeOf(slot) }, attached, forms: forms.map(f => ({ id: f.id, title: f.title, anonymous: f.anonymous })) }
})
