// Records an award the committee has decided: pick a person, or give a name and address, which finds
// the account that has it or makes an unclaimed one. With a name alone it is a historical award: it
// is listed, and gives no ticket benefit until an account is linked. Nobody issues their own.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse, siteUrl, useSetting } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findOrCreateAccount, notify } from '#modules/core'
import { awardFields, writeAward } from '../../../../awards'
import { requireType } from '../../../../types'

const input = awardFields.partial({ awardedFor: true, citation: true, productionId: true, decidedOn: true, decisionNote: true, visibility: true, recipientName: true }).extend({
  accountId: z.string().optional(),
  address: z.string().trim().email().max(254).optional(), // not-policy: an address's bound
}).refine(i => !(i.accountId && i.address), { message: 'Pick a person or give an address, not both', path: ['accountId'] })
  .refine(i => !!i.accountId || !!i.recipientName, { message: 'Give the name to print', path: ['recipientName'] })

export default defineRoute({
  ability: 'awards.award.issue',
  record: event => ['awards.type', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input,
}, async (_event, { input, actor, record, unit }) => {
  const type = await requireType(record!.id)
  if (type.state !== 'active') refuse('awards.type.archived', `${type.name} is archived, so it cannot be given.`, { status: 409, remedy: 'Restore the award first.' })
  let accountId: string | null = input.accountId ?? null
  let name = input.recipientName
  if (accountId) {
    const account = await first<{ name: string | null }>('SELECT name FROM core_accounts WHERE id = ? AND anonymised_at IS NULL', accountId)
    if (!account) refuse('core.not-found', 'There is no such person.', { status: 404 })
    name ??= account!.name ?? undefined
    if (!name) refuse('awards.award.name-needed', 'This person has no name on their account, so give the name to print.', { status: 422, fields: { recipientName: 'awards.award.name-needed' } })
  }
  else if (input.address) {
    accountId = (await findOrCreateAccount(unit, { address: input.address, name, origin: 'staff' })).accountId
  }
  if (accountId && actor.accountId && await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, accountId, actor.accountId))
    refuse('awards.award.own', 'You cannot issue an award to your own account.', { status: 403, remedy: 'Ask somebody else who may issue awards.' })
  if (accountId && type.onePerPerson) {
    const held = await first<{ id: string }>(`SELECT id FROM awards_awards WHERE type_id = ?1 AND state = 'current' AND account_id IN (${accountScopeSql('?2')}) LIMIT 1`, type.id, accountId) // not-policy: numbered parameters
    if (held) refuse('awards.award.already-held', `This person already holds ${type.name}.`, { status: 409, remedy: 'Open their award to correct it instead.', detail: { awardId: held.id } })
  }
  if (input.productionId && !(await first('SELECT 1 FROM core_productions WHERE id = ?', input.productionId)))
    refuse('awards.award.no-production', 'There is no such production.', { status: 422, fields: { productionId: 'awards.award.no-production' } })
  const awardId = writeAward(unit, { type, accountId, recipientName: name!, awardedOn: input.awardedOn, awardedFor: input.awardedFor, citation: input.citation, productionId: input.productionId, decidedOn: input.decidedOn, decisionNote: input.decisionNote, visibility: input.visibility, source: 'direct', issuedBy: actor.accountId ?? null })
  if (accountId && await useSetting('awards.issuing.tell-recipient'))
    await notify(unit, 'awards.awarded', { to: accountId, variables: { award: type.name, link: await siteUrl('/account/awards') }, subject: ['awards.award', awardId], dedupeKey: `awarded:${awardId}` })
  unit.audit({ action: 'create', record: ['awards.award', awardId], detail: { source: 'direct', linked: !!accountId } })
  return { awardId, accountId }
})
