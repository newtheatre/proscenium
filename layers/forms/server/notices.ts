// What forms tells people (core.notification-type): a receipt when a response is sent, word when
// staff move it, and a request to each reviewer when a round opens. All are sent with core's
// notify in the unit of the change itself, so a message goes exactly when the change holds.
// Somebody who answered signed out is told by email alone, at the address they gave; an anonymous
// form tells nobody, because it does not know who answered. Nothing anybody wrote is put in a
// message: it says what happened and where to read the rest.
import { siteUrl, type UnitView } from '#kit'
import { notify, notifyAddress } from '#modules/core'
import type { Stage } from '../shared/engine'
import { statusOf } from '../shared/engine'

interface About { id: string, reference: string, personId: string | null, respondentEmail: string | null }
const record = (id: string) => ['forms.response', id] as const
const mine = (id: string) => siteUrl(`/account/forms/${id}`)

/** A receipt for a response just sent. */
export async function tellReceived(unit: UnitView, form: { title: string }, response: About): Promise<void> {
  const variables = { form: form.title, reference: response.reference }
  if (response.personId) await notify(unit, 'forms.received', { to: response.personId, variables: { ...variables, link: await mine(response.id) }, subject: record(response.id), dedupeKey: `received:${response.id}` })
  else if (response.respondentEmail) await notifyAddress(unit, 'forms.received-guest', { address: response.respondentEmail, variables, record: record(response.id), dedupeKey: `received:${response.id}` })
}

/**
 * Word of a move staff made, when it changes what the person is told about their response. A
 * response sent back for changes says so and where to make them.
 */
export async function tellMoved(unit: UnitView, form: { title: string }, response: About, move: { from: Stage | undefined, to: Stage, key: string, at: number }): Promise<void> {
  const status = statusOf(move.to)
  if (move.from && statusOf(move.from) === status) return
  const dedupeKey = `moved:${response.id}:${move.key}:${move.at}`
  const variables = { form: form.title, reference: response.reference, status }
  if (response.personId) {
    await notify(unit, move.to.kind === 'returned' ? 'forms.returned' : 'forms.status', { to: response.personId, variables: { ...variables, link: await mine(response.id) }, subject: record(response.id), dedupeKey })
  }
  else if (response.respondentEmail) {
    await notifyAddress(unit, 'forms.status-guest', { address: response.respondentEmail, variables, record: record(response.id), dedupeKey })
  }
}

/** Asks each reviewer of a round that has just opened. `assigned` is reviewer by assignment id. */
export async function tellReviewers(unit: UnitView, form: { title: string }, responseId: string, assigned: { assignmentId: string, reviewerId: string }[]): Promise<void> {
  if (!assigned.length) return
  const to = await Promise.all(assigned.map(async a => ({ accountId: a.reviewerId, variables: { link: await siteUrl(`/account/forms/review/${a.assignmentId}`) }, dedupeKey: `review:${a.assignmentId}` })))
  await notify(unit, 'forms.review-requested', { to, variables: { form: form.title }, subject: record(responseId) })
}
