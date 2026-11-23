// Links an account to an award recorded by name alone, such as an imported one: pick a person, or
// give an address, which finds the account that has it or makes an unclaimed one. From then the
// holder sees it in My awards and it carries its ticket price. An award already linked is not
// moved: a wrong one is revoked. When the person already holds an award of a once-only type, the
// link is refused with the one they hold, and `merge: true` folds this one into it instead: their
// award takes the earlier date, and what it lacks (what it was for, the citation) from this one,
// which is then revoked as merged.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { can, defineRoute, first, nowMs, ownRecordExempt, refuse } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findOrCreateAccount } from '#modules/core'
import { requireAward } from '../../../../awards'
import { requireType } from '../../../../types'

const input = z.object({
  accountId: z.string().optional(),
  address: z.string().trim().email().max(254).optional(), // not-policy: an address's bound
  merge: z.boolean().optional(),
}).refine(i => !!i.accountId !== !!i.address, { message: 'Pick a person or give an address', path: ['accountId'] })

export default defineRoute({
  ability: 'awards.award.update',
  record: event => ['awards.award', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input,
}, async (_event, { input, actor, record, unit }) => {
  const award = await requireAward(record!.id)
  const type = await requireType(award.typeId)
  let accountId = input.accountId ?? null
  if (accountId && !(await first('SELECT 1 FROM core_accounts WHERE id = ? AND anonymised_at IS NULL', accountId))) refuse('core.not-found', 'There is no such person.', { status: 404 })
  if (!accountId) accountId = (await findOrCreateAccount(unit, { address: input.address!, name: award.recipientName, origin: 'staff' })).accountId
  if (actor.accountId && await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, accountId, actor.accountId) && !(await ownRecordExempt(actor)))
    refuse('awards.award.own', 'You cannot link an award to your own account.', { status: 403, remedy: 'Ask somebody else who may correct awards.' })
  if (type.onePerPerson && award.state === 'current' && !award.accountId) {
    const mine = await first<{ id: string, awardedOn: string, awardedPrecision: string, awardedFor: string | null, citation: string | null }>(
      `SELECT id, awarded_on AS awardedOn, awarded_precision AS awardedPrecision, awarded_for AS awardedFor, citation FROM awards_awards WHERE type_id = ?1 AND state = 'current' AND account_id IN (${accountScopeSql('?2')}) LIMIT 1`, // not-policy: numbered parameters
      award.typeId, accountId,
    )
    if (mine && !input.merge)
      refuse('awards.award.already-held', `This person already holds ${type.name}.`, { status: 409, remedy: 'Open their award, or merge this one into it.', detail: { awardId: mine.id } })
    if (mine) {
      if (!(await can(actor, 'awards.award.revoke')).allowed) refuse('core.forbidden', 'You may not merge awards.', { status: 403, remedy: 'Ask somebody who may revoke awards.' })
      const at = nowMs()
      const earlier = award.awardedOn < mine.awardedOn || (award.awardedOn === mine.awardedOn && award.awardedPrecision === 'day')
      unit.add({
        sql: 'UPDATE awards_awards SET awarded_on = ?1, awarded_precision = ?2, awarded_for = coalesce(awarded_for, ?3), citation = coalesce(citation, ?4), updated_at = ?5 WHERE id = ?6 AND state = \'current\'', // not-policy: numbered parameters
        params: [earlier ? award.awardedOn : mine.awardedOn, earlier ? award.awardedPrecision : mine.awardedPrecision, award.awardedFor, award.citation, at, mine.id],
      }).expect(1, { code: 'awards.award.not-linkable', reason: 'Their award changed while you were merging.', remedy: 'Reload and try again.' })
      unit.add({
        sql: 'UPDATE awards_awards SET state = \'revoked\', revoked_at = ?1, revoked_by = ?2, revoke_reason = ?3, updated_at = ?1 WHERE id = ?4 AND account_id IS NULL AND state = \'current\'', // not-policy: numbered parameters
        params: [at, actor.accountId ?? null, `Merged into the holder's ${type.name} (${mine.id}).`, award.id],
      }).expect(1, { code: 'awards.award.not-linkable', reason: 'Only a current award with no account can be linked.' })
      unit.announce('awards.award.revoked', { awardId: award.id, typeId: award.typeId }, { record: ['awards.award', award.id] })
      unit.audit({ action: 'update', record: ['awards.award', mine.id], detail: { fields: ['awardedOn', 'awardedFor', 'citation'], mergedFrom: award.id } })
      return { awardId: mine.id, accountId, merged: award.id }
    }
  }
  const held = type.onePerPerson ? ` AND NOT EXISTS (SELECT 1 FROM awards_awards WHERE type_id = ?4 AND state = 'current' AND account_id IN (${accountScopeSql('?1')}))` : '' // not-policy: numbered parameters
  const sql = `UPDATE awards_awards SET account_id = ?1, updated_at = ?2 WHERE id = ?3 AND account_id IS NULL AND state = 'current' AND ?4 = ?4${held}` // not-policy: numbered parameters
  unit.add({ sql, params: [accountId, nowMs(), award.id, award.typeId] }).expect(1, award.accountId || award.state !== 'current'
    ? { code: 'awards.award.not-linkable', reason: 'Only a current award with no account can be linked.' }
    : { code: 'awards.award.already-held', reason: `This person already holds ${type.name}.`, remedy: 'Revoke one of the two awards instead.' })
  unit.audit({ action: 'update', record: ['awards.award', award.id], detail: { fields: ['accountId'] } })
  return { awardId: award.id, accountId }
})
