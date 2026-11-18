// Give somebody a role (ID-23, ID-29), or invite somebody to one by name and address (ID-06). An
// address nobody holds makes an unclaimed account, which needs the ability to add people too. The
// grant waits for the person's first sign-in, and the invitation's link is that sign-in. While the
// theatre cannot send email yet, the link is given back once, for the inviter to pass on.
import { z } from 'zod'
import { defineRoute, first, refuse, requireAbility } from '#kit'
import { normaliseAddress } from '../../identity/accounts'
import { findOrCreateAccount } from '../../identity/guests'
import { createInvitation } from '../../identity/invitations'
import { canSendEmail } from '../../notifications/send'
import { giveRole } from '../../identity/roles'
import { roleNotice } from '../../identity/notices'
import { scopeInput } from '../../identity/inputs'

export default defineRoute({
  ability: 'core.grant.manage',
  rateLimit: 'write',
  input: z.object({
    accountId: z.string().max(40).optional(), // not-policy: ids are short
    person: z.object({
      address: z.email().max(254), // not-policy: the longest address SMTP allows
      name: z.string().trim().min(1).max(200), // not-policy: a person's name
    }).strict().optional(),
    roleId: z.string().max(40), // not-policy: ids are short
    scope: scopeInput.default({ kind: 'site' }),
    expiresAt: z.number().int().nullable().optional(),
  }).strict().refine(i => !i.accountId !== !i.person, { message: 'give either accountId or person', path: ['accountId'] }),
}, async (event, { input, unit, actor }) => {
  const { person, ...grant } = input
  if (!person) {
    const given = await giveRole(unit, actor, { ...grant, accountId: input.accountId! })
    await roleNotice(unit, input.accountId!, grant.roleId, { given: true, expiresAt: given.expiresAt })
    return { id: given.id }
  }

  const found = await findOrCreateAccount(unit, { address: person.address, name: person.name, origin: 'invite' })
  // A refusal here discards the unit, and with it the account just added to it.
  if (found.created) await requireAbility(actor, 'core.account.create')
  if (found.accountId === actor.accountId) refuse('core.grant.self', 'You cannot give yourself a role.', { status: 403, remedy: 'Ask someone else who can give roles.' })
  const { id, expiresAt } = await giveRole(unit, actor, { ...grant, accountId: found.accountId }, { newAccount: found.created })
  if (found.claimed) {
    await roleNotice(unit, found.accountId, grant.roleId, { given: true, expiresAt })
    return { id, accountId: found.accountId, invited: false }
  }
  const role = await first<{ name: string }>('SELECT name FROM core_roles WHERE id = ?', grant.roleId)
  const invitation = await createInvitation(unit, event, actor, { accountId: found.accountId, address: normaliseAddress(person.address), role: role!.name })
  if (await canSendEmail()) return { id, accountId: found.accountId, invited: true, emailed: true }
  return { id, accountId: found.accountId, invited: true, emailed: false, link: invitation.link, expiresAt: invitation.expiresAt }
})
