// A person's training records, for those who may see them (L4). Reads are audited.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { recordsOf } from '../../../../progress'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (event, { actor, unit }) => {
  const accountId = getRouterParam(event, 'id')!
  const records = await recordsOf(accountId)
  const shown = []
  for (const r of records) if ((await can(actor, 'training.record.view', ['training.record', r.id])).allowed) shown.push(r)
  if (records.length && !shown.length && actor.accountId !== accountId) refuse('core.access.denied', 'You cannot see this person\'s training.', { status: 403 })
  if (actor.accountId !== accountId) unit.audit({ action: 'read', record: ['core.account', accountId], detail: { trainingRecords: shown.length } })
  return { records: shown }
})
