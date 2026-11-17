// Links an account to an award recorded by name alone, such as an imported one: pick a person, or
// give an address, which finds the account that has it or makes an unclaimed one. From then the
// holder sees it in My awards and it carries its ticket price. An award already linked is not
// moved: a wrong one is revoked.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, nowMs, refuse } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findOrCreateAccount } from '#modules/core'
import { requireAward } from '../../../../awards'
import { requireType } from '../../../../types'

const input = z.object({
  accountId: z.string().optional(),
  address: z.string().trim().email().max(254).optional(), // not-policy: an address's bound
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
  if (actor.accountId && await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, accountId, actor.accountId))
    refuse('awards.award.own', 'You cannot link an award to your own account.', { status: 403, remedy: 'Ask somebody else who may correct awards.' })
  const held = type.onePerPerson ? ` AND NOT EXISTS (SELECT 1 FROM awards_awards WHERE type_id = ?4 AND state = 'current' AND account_id IN (${accountScopeSql('?1')}))` : '' // not-policy: numbered parameters
  const sql = `UPDATE awards_awards SET account_id = ?1, updated_at = ?2 WHERE id = ?3 AND account_id IS NULL AND state = 'current' AND ?4 = ?4${held}` // not-policy: numbered parameters
  unit.add({ sql, params: [accountId, nowMs(), award.id, award.typeId] }).expect(1, award.accountId || award.state !== 'current'
    ? { code: 'awards.award.not-linkable', reason: 'Only a current award with no account can be linked.' }
    : { code: 'awards.award.already-held', reason: `This person already holds ${type.name}.`, remedy: 'Revoke one of the two awards instead.' })
  unit.audit({ action: 'update', record: ['awards.award', award.id], detail: { fields: ['accountId'] } })
  return { awardId: award.id, accountId }
})
