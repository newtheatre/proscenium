// Slots (forms.slot; form builder specification, part 4, "Slots in detail"): a place another
// module declares where a form can be attached to one of its records, such as a nomination for an
// award. Forms never learns what the record is. An attached form is a placement like the form's
// own link, with its own dates, cap and count, and each response keeps the record it is about.
import { getQuery, type H3Event } from 'h3'
import { all, first, newId, refuse, requireAbility, siteUrl, usePoint, type Actor, type UnitView } from '#kit'
import type { FormRow } from './forms'
import { LINK_SLOT } from './db/schema'
import { PLACE, getLink, type LinkRow, type StoredPlace } from './responses'
import { sourceOf } from './sources'

export interface FormsSlot {
  /** `<module>.<name>`, such as `awards.nomination`. Never changes. */
  id: string
  /** The record type a response here is about. */
  subject: string
  /** The translation key of its name, as the builder and the response page show it. */
  label: string
  /** The ability needed, on the record, to attach a form here or take one away. */
  attach: string
  /** The most forms one record carries here at once. One unless said. */
  limit?: number
  /** A forms.source that names the subject's records, so a response can say what it is about. */
  source?: string
}

export async function slots(): Promise<FormsSlot[]> {
  return (await usePoint<FormsSlot>('forms.slot')).map(c => c.value)
}
export const slotOf = async (id: string | undefined): Promise<FormsSlot | undefined> => (await slots()).find(s => s.id === id)

/** A slot by id, or a refusal that reads the same whether it was never declared or its module is off. */
export async function requireSlot(id: string | undefined): Promise<FormsSlot> {
  return await slotOf(id) ?? refuse('forms.slot.not-found', 'A form cannot be attached here.', { status: 404 }) // not-policy: HTTP status
}

/** The place an address names, as `?place=`. */
export function placeIn(event: H3Event): string | undefined {
  const place = getQuery(event).place
  return typeof place === 'string' && place ? place : undefined
}

const read = (row: StoredPlace | null): LinkRow | null => row ? { ...row, onePerPerson: !!row.onePerPerson } : null

/**
 * Where a form is being answered: its own link, or, when the address names one, a place it is
 * attached. An attachment that has been taken away, or whose module is switched off, is not there.
 */
export async function placeOf(form: FormRow, placeId: string | undefined): Promise<LinkRow | null> {
  if (!placeId) return getLink(form.id)
  const place = read(await first<StoredPlace>(`SELECT ${PLACE} FROM forms_placements WHERE id = ? AND form_id = ? AND slot_key <> '${LINK_SLOT}' AND status <> 'ended'`, placeId, form.id))
  return place && await slotOf(place.slotKey) ? place : null
}

export interface Attached extends LinkRow { title: string, slug: string, formStatus: string, anonymous: boolean, address: string }

/** The forms attached to a record in a slot, oldest first. Those taken away are left out. */
export async function attachedTo(slot: string, subjectId: string): Promise<Attached[]> {
  const rows = await all<StoredPlace & { title: string, slug: string, formStatus: string, anonymous: number }>(
    `SELECT ${PLACE.split(', ').map(c => `p.${c}`).join(', ')}, f.title, f.slug, f.status AS formStatus, f.anonymous
     FROM forms_placements p JOIN forms_forms f ON f.id = p.form_id WHERE p.slot_key = ? AND p.subject_id = ? AND p.status <> 'ended' ORDER BY p.created_at, p.id`, slot, subjectId)
  return Promise.all(rows.map(async r => ({ ...r, onePerPerson: !!r.onePerPerson, anonymous: !!r.anonymous, address: await siteUrl(`/forms/${r.slug}?place=${r.id}`) })))
}

export const mayAttach = (actor: Actor, slot: FormsSlot, subjectId: string) => requireAbility(actor, slot.attach as never, [slot.subject, subjectId])

export interface Terms { audience: 'anyone' | 'signed_in', opensAt: number | null, closesAt: number | null, responseCap: number | null, onePerPerson: boolean, status: 'active' | 'paused' }

/**
 * Attaches a published form to a record, or changes the terms of one already there. A form taken
 * away and attached again carries on with the place it had, so its responses stay together.
 */
export async function attach(unit: UnitView, input: { slot: FormsSlot, subjectId: string, form: FormRow, terms: Terms, actor: Actor, at: number }): Promise<string> {
  const { slot, form, terms } = input
  if (!form.liveVersionId || form.status === 'archived') return refuse('forms.slot.unpublished', 'Publish this form before attaching it.', { status: 409 }) // not-policy: HTTP status
  if (form.mode !== 'submission') return refuse('forms.slot.wrong-mode', 'This form cannot be attached here.', { status: 409 }) // not-policy: HTTP status
  if (terms.opensAt !== null && terms.closesAt !== null && terms.closesAt <= terms.opensAt)
    return refuse('forms.link.dates', 'The form must close after it opens.', { status: 422, fields: { closesAt: 'forms.link.dates' } }) // not-policy: HTTP status
  if (form.anonymous && terms.onePerPerson)
    return refuse('forms.link.anonymous-once', 'An anonymous form cannot hold people to one response each.', { status: 422, fields: { onePerPerson: 'forms.link.anonymous-once' } }) // not-policy: HTTP status
  const existing = await first<{ id: string, status: string, responseCount: number }>('SELECT id, status, response_count AS responseCount FROM forms_placements WHERE slot_key = ? AND subject_type = ? AND subject_id = ? AND form_id = ?', slot.id, slot.subject, input.subjectId, form.id)
  if (existing && terms.responseCap !== null && terms.responseCap < existing.responseCount)
    return refuse('forms.link.cap-below', `This form already has ${existing.responseCount} responses, so the cap cannot be lower.`, { status: 422, fields: { responseCap: 'forms.link.cap-below' } }) // not-policy: HTTP status
  const values = [terms.audience, terms.opensAt, terms.closesAt, terms.responseCap, terms.onePerPerson ? 1 : 0, terms.status]
  const id = existing?.id ?? newId('fpl')
  if (existing) {
    unit.add({ sql: 'UPDATE forms_placements SET audience = ?, opens_at = ?, closes_at = ?, response_cap = ?, one_per_person = ?, status = ? WHERE id = ?', params: [...values, id] }).expect(1)
  }
  else {
    unit.add({
      sql: 'INSERT INTO forms_placements (id, form_id, slot_key, subject_type, subject_id, audience, opens_at, closes_at, response_cap, one_per_person, status, response_count, edit_after_submit, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, \'never\', ?, ?)',
      params: [id, form.id, slot.id, slot.subject, input.subjectId, ...values, input.actor.accountId ?? null, input.at],
    }).expect(1)
  }
  if (!existing || existing.status === 'ended') {
    // The limit is held by the statement, so two people attaching at once cannot both take the last place.
    unit.add({
      sql: 'UPDATE forms_placements SET status = status WHERE id = ? AND (SELECT count(*) FROM forms_placements WHERE slot_key = ? AND subject_type = ? AND subject_id = ? AND status <> \'ended\') <= ?',
      params: [id, slot.id, slot.subject, input.subjectId, slot.limit ?? 1],
    }).expect(1, { code: 'forms.slot.full', reason: 'No more forms can be attached here.', remedy: 'Take one away first.' })
  }
  unit.audit({ action: 'update', record: ['forms.form', form.id], detail: { slot: slot.id, subject: input.subjectId, attached: existing && existing.status !== 'ended' ? 'changed' : 'made', status: terms.status } })
  return id
}

/** Takes a form away from a record. Its responses stay, and stay about that record. */
export function detach(unit: UnitView, input: { slot: FormsSlot, subjectId: string, formId: string }): void {
  unit.add({ sql: 'UPDATE forms_placements SET status = \'ended\' WHERE slot_key = ? AND subject_type = ? AND subject_id = ? AND form_id = ? AND status <> \'ended\'', params: [input.slot.id, input.slot.subject, input.subjectId, input.formId] })
    .expect(1, { code: 'forms.slot.not-attached', reason: 'This form is not attached here.' })
  unit.audit({ action: 'update', record: ['forms.form', input.formId], detail: { slot: input.slot.id, subject: input.subjectId, attached: 'ended' } })
}

/** What a response is about, in words: the slot's name and, where its source can say, the record's. */
export async function aboutOf(response: { placementId: string, subjectType: string | null, subjectId: string | null }): Promise<{ slot: string, label: string, name: string | null } | null> {
  if (!response.subjectId) return null
  const place = await first<{ slotKey: string }>('SELECT slot_key AS slotKey FROM forms_placements WHERE id = ?', response.placementId)
  const slot = await slotOf(place?.slotKey)
  if (!slot) return null
  const source = await sourceOf(slot.source)
  return { slot: slot.id, label: slot.label, name: source ? (await source.labels([response.subjectId]))[response.subjectId] ?? null : null }
}
