// Gives a form its link, or changes it (FB-301): the audience, the dates it opens and closes, a cap
// on responses and whether each person may answer once. Publishing rights are needed, because this
// is what puts the form in front of people.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { requireForm } from '../../../../forms'
import { getLink } from '../../../../responses'

const when = z.number().int().min(0).nullable()
const input = z.object({
  audience: z.enum(['anyone', 'signed_in']),
  opensAt: when,
  closesAt: when,
  responseCap: z.number().int().min(1).max(1_000_000).nullable(), // not-policy: only to keep the number sane
  onePerPerson: z.boolean(),
  status: z.enum(['active', 'paused']),
})

export default defineRoute({ ability: 'forms.form.publish', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'write', input }, async (_event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  if (form.mode === 'record') refuse('forms.link.record', 'Custom fields are filled in on their record, so they have no link.', { status: 409 }) // not-policy: HTTP status
  if (input.opensAt !== null && input.closesAt !== null && input.closesAt <= input.opensAt)
    refuse('forms.link.dates', 'The form must close after it opens.', { status: 422, fields: { closesAt: 'forms.link.dates' } })
  // An anonymous form keeps nothing to tell one person from another, so it cannot hold them to one answer.
  if (form.anonymous && input.onePerPerson)
    refuse('forms.link.anonymous-once', 'An anonymous form cannot hold people to one response each.', { status: 422, fields: { onePerPerson: 'forms.link.anonymous-once' } })
  const link = await getLink(form.id)
  if (link && input.responseCap !== null && input.responseCap < link.responseCount)
    refuse('forms.link.cap-below', `This form already has ${link.responseCount} responses, so the cap cannot be lower.`, { status: 422, fields: { responseCap: 'forms.link.cap-below' } })
  const values = [input.audience, input.opensAt, input.closesAt, input.responseCap, input.onePerPerson ? 1 : 0, input.status]
  if (link) {
    unit.add({ sql: 'UPDATE forms_placements SET audience = ?, opens_at = ?, closes_at = ?, response_cap = ?, one_per_person = ?, status = ? WHERE id = ?', params: [...values, link.id] }).expect(1)
  }
  else {
    unit.add({
      sql: 'INSERT INTO forms_placements (id, form_id, slot_key, audience, opens_at, closes_at, response_cap, one_per_person, status, response_count, edit_after_submit, created_by, created_at) VALUES (?, ?, \'forms.link\', ?, ?, ?, ?, ?, ?, 0, \'never\', ?, ?)',
      params: [newId('fpl'), form.id, ...values, actor.accountId, nowMs()],
    }).expect(1)
  }
  unit.audit({ action: 'update', record: ['forms.form', form.id], detail: { link: link ? 'changed' : 'made', audience: input.audience, status: input.status } })
  return { formId: form.id }
})
