// Takes an award back, with a reason. It leaves the roll and its ticket benefit stops at once;
// tickets already bought are not cancelled. A revoked award is kept as a record and is not restored:
// the committee issues a new one.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs } from '#kit'
import { requireAward } from '../../../../awards'

export default defineRoute({
  ability: 'awards.award.revoke',
  record: event => ['awards.award', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ reason: z.string().trim().min(1).max(500) }), // not-policy: a sentence or two
}, async (_event, { input, actor, record, unit }) => {
  const award = await requireAward(record!.id)
  const at = nowMs()
  unit.add({
    sql: "UPDATE awards_awards SET state = 'revoked', revoked_at = ?, revoked_by = ?, revoke_reason = ?, updated_at = ? WHERE id = ? AND state = 'current'",
    params: [at, actor.accountId ?? null, input.reason, at, award.id],
  }).expect(1, { code: 'awards.award.already-revoked', reason: 'This award has already been revoked.' })
  unit.announce('awards.award.revoked', { awardId: award.id, typeId: award.typeId }, { record: ['awards.award', award.id] })
  unit.audit({ action: 'state', record: ['awards.award', award.id], detail: { to: 'revoked' } })
  return { awardId: award.id, state: 'revoked' }
})
