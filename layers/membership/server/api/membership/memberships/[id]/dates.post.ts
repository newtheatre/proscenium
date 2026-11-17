// Staff correct a membership's dates (D7, MEM-28): a mid-year correction, or what the students'
// union's records show. Only an active membership; the end not before the start; never overlapping
// the membership that renews it. The audit entry holds the dates before and after, and the note why.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, nowMs, refuse } from '#kit'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of a date

export default defineRoute({
  ability: 'membership.membership.update',
  record: event => ['membership.membership', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    startsOn: DATE,
    endsOn: DATE.nullable(),
    note: z.string().trim().min(1).max(500), // not-policy: the bound of a staff note
  }).strict(),
}, async (_event, { input, record, unit }) => {
  const id = record!.id!
  const now = await first<{ state: string, starts_on: string | null, ends_on: string | null, length_rule: string }>(
    'SELECT m.state, m.starts_on, m.ends_on, s.length_rule FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id WHERE m.id = ?', id,
  )
  if (!now) refuse('core.not-found', 'There is no such membership.', { status: 404 })
  if (now!.state !== 'active') refuse('membership.dates.not-active', 'Only a membership that is running can have its dates changed.', { status: 409, remedy: 'Add a new membership with the right dates instead.' })
  if (input.endsOn !== null && input.endsOn < input.startsOn) refuse('membership.dates.out-of-order', 'The end date is before the start date.', { status: 422 })
  if (input.endsOn === null && now!.length_rule !== 'indefinite') refuse('membership.dates.needs-end', 'This scheme\'s memberships have an end date.', { status: 422 })
  const renewal = await first<{ starts_on: string | null }>("SELECT starts_on FROM membership_memberships WHERE renews_id = ? AND state IN ('pending', 'active')", id)
  if (renewal?.starts_on && (input.endsOn === null || input.endsOn >= renewal.starts_on))
    refuse('membership.dates.overlaps-renewal', `It has been renewed from ${renewal.starts_on}, so it must end before then.`, { status: 409, remedy: 'Change or end the renewal first.' })

  const at = nowMs()
  unit.add({
    sql: 'UPDATE membership_memberships SET starts_on = ?, ends_on = ?, note = ?, last_reminder = NULL, updated_at = ? WHERE id = ? AND state = \'active\' AND starts_on IS ? AND ends_on IS ?',
    params: [input.startsOn, input.endsOn, input.note, at, id, now!.starts_on, now!.ends_on],
  }).expect(1, { code: 'membership.dates.changed-meanwhile', reason: 'Somebody else changed this membership just now.', remedy: 'Reload the page and try again.' })
  unit.audit({ action: 'update', record: ['membership.membership', id], detail: { fromStartsOn: now!.starts_on, fromEndsOn: now!.ends_on, toStartsOn: input.startsOn, toEndsOn: input.endsOn } })
  return { startsOn: input.startsOn, endsOn: input.endsOn }
})
