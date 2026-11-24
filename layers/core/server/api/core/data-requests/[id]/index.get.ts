// One data request for staff (ID-35), with its hand-search checklist and what the viewer may do
// with it now, so the page offers only those.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs } from '#kit'
import { accountLabel } from '../../../../identity/accounts'
import { checklistOf, requestById } from '../../../../identity/data-requests'

export default defineRoute({
  ability: 'core.data-request.manage',
  record: event => ['core.data-request', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const r = (await requestById(record!.id))!
  const checklist = await checklistOf(r.id)
  const [person, requestedBy, closedBy] = await Promise.all([
    accountLabel(r.account_id),
    r.requested_by === r.account_id ? null : accountLabel(r.requested_by),
    r.closed_by ? accountLabel(r.closed_by) : null,
  ])
  const finished = r.state === 'done' || r.state === 'cancelled'
  return {
    request: {
      id: r.id,
      accountId: r.account_id,
      person,
      kind: r.kind,
      state: r.state,
      requestedAt: r.requested_at,
      requestedBy,
      identityCheck: r.identity_check,
      respondBy: r.respond_by,
      overdue: !r.closed_at && r.respond_by < nowMs(),
      notBefore: r.not_before,
      holds: r.holds ? JSON.parse(r.holds) as string[] : [],
      finishedAt: r.finished_at,
      closedAt: r.closed_at,
      closedBy,
    },
    checklist,
    actions: {
      cancel: ['requested', 'confirmed', 'held'].includes(r.state),
      tick: !r.closed_at,
      close: !r.closed_at && finished && (r.state === 'cancelled' || checklist.every(l => l.outcome)),
    },
  }
})
