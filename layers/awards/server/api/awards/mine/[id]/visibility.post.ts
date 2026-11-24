// The holder chooses where their own award is listed: publicly, to members only, or not at all.
// Their choice stands over the award type's default.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { VISIBILITIES } from '../../../../db/schema'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({ visibility: z.enum(VISIBILITIES) }) }, async (event, { input, actor, unit }) => {
  const id = getRouterParam(event, 'id', { decode: true })!
  unit.add({
    sql: `UPDATE awards_awards SET visibility = ?1, listing_pending = 0, updated_at = ?2 WHERE id = ?3 AND state = 'current' AND account_id IN (${accountScopeSql('?4')})`,
    params: [input.visibility, nowMs(), id, actor.accountId ?? ''],
  }).expect(1, { code: 'core.not-found', reason: 'There is no such award.' })
  unit.audit({ action: 'update', record: ['awards.award', id], detail: { fields: ['visibility'] } })
  return { awardId: id, visibility: input.visibility }
})
