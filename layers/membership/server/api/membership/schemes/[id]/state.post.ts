// Opens, closes and archives a scheme (MEM-02; tab 3, "States of a scheme"). Opening is refused
// while anything on the checklist is missing (S4); closing and archiving say how many are affected.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { all, defineRoute, nowMs, refuse } from '#kit'
import { todayOrNull } from '../../../../memberships'
import { openChecklist, requireScheme } from '../../../../schemes'

const MAY_GO = { draft: ['open'], open: ['closed'], closed: ['open', 'archived'], archived: ['closed'] } as const

export default defineRoute({
  ability: 'membership.scheme.manage',
  record: event => ['membership.scheme', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ to: z.enum(['open', 'closed', 'archived']) }),
}, async (_event, { input, record, unit }) => {
  const scheme = await requireScheme(record!.id)
  if (!(MAY_GO[scheme.state] as readonly string[]).includes(input.to))
    refuse('membership.scheme.cannot-move', `A ${scheme.state} scheme cannot be made ${input.to}.`, { status: 409 })
  if (input.to === 'open') {
    const missing = (await openChecklist(scheme)).filter(i => !i.done).map(i => i.code)
    if (missing.length) refuse(`membership.scheme.needs-${missing[0]}`, 'This scheme is not ready to open yet.', { status: 409, remedy: `Still needed: ${missing.join(', ')}.` })
  }
  unit.add({ sql: 'UPDATE membership_schemes SET state = ?, updated_at = ? WHERE id = ? AND state = ?', params: [input.to, nowMs(), scheme.id, scheme.state] })
    .expect(1, { code: 'membership.scheme.changed', reason: 'The scheme was changed by somebody else.', remedy: 'Reload it and try again.' })
  unit.audit({ action: 'state', record: ['membership.scheme', scheme.id], detail: { from: scheme.state, to: input.to } })
  if (input.to === 'open') unit.announce('membership.scheme.opened', { schemeId: scheme.id }, { record: ['membership.scheme', scheme.id] })
  if (input.to === 'closed' && scheme.state === 'open') unit.announce('membership.scheme.closed', { schemeId: scheme.id }, { record: ['membership.scheme', scheme.id] })
  const day = await todayOrNull()
  const [affected] = await all<{ holders: number, pending: number }>(
    `SELECT count(DISTINCT CASE WHEN m.state = 'active' AND (m.ends_on IS NULL OR m.ends_on >= ?2) THEN m.account_id END) AS holders,
            count(CASE WHEN m.state = 'pending' THEN 1 END) AS pending
       FROM membership_memberships m WHERE m.scheme_id = ?1`,
    scheme.id, day ?? '9999-12-31',
  )
  return { state: input.to, holders: affected?.holders ?? 0, pending: affected?.pending ?? 0 }
})
