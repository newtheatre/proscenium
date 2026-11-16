// Sign a person out of every browser.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { endSessionsOf } from '../../../../identity/sessions'

export default defineRoute({
  ability: 'core.session.end',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record, actor }) => {
  endSessionsOf(unit, record!.id, record!.id === actor.accountId ? 'ended_by_person' : 'ended_by_staff')
  unit.audit({ action: 'state', record: ['core.account', record!.id], detail: { sessionsEnded: true } })
  return { id: record!.id }
})
