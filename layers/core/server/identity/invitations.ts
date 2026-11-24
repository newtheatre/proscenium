// Invitations (ID-06): a role given to somebody who has never signed in. The grant is written at
// once and counts for nothing until they claim the account; the invitation is a single-use link
// that signs them in and so claims it. After the link lapses an ordinary sign-in with the same
// address does the same, because the grant waits on the account, not on the link.
import { type RequestEvent } from 'nuxt/server'
import { newId, nowMs, useSetting, siteUrl, type Actor, type UnitView } from '#kit'
import { digest, randomToken } from './crypto'
import { notify } from '../notifications/notify'

export interface Invitation { tokenId: string, link: string, expiresAt: number }

/**
 * Writes the invitation's token and the email that carries its link, in the same unit. The link is a
 * sealed variable: kept encrypted, sent by email only and cleared once sent. The account is unclaimed,
 * so the email goes to the address it was created with, looked up when it is sent.
 */
export async function createInvitation(unit: UnitView, event: RequestEvent, actor: Actor, to: { accountId: string, address: string, role: string }): Promise<Invitation> {
  const token = randomToken()
  const tokenId = newId('tok', { random: true })
  const at = nowMs()
  const lifetime = await useSetting('core.sign-in.invite-lifetime') as number
  const expiresAt = at + lifetime * 1000 // not-policy: seconds to milliseconds
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, account_id, address, issued_by, attempts, created_at, expires_at)
          VALUES (?, 'invite', ?, ?, ?, ?, 0, ?, ?)`,
    params: [tokenId, await digest('link', token), to.accountId, to.address, actor.accountId ?? null, at, expiresAt],
  })
  const link = await siteUrl(`/sign-in/link#${token}`)
  await notify(unit, 'core.invitation', { to: to.accountId, variables: { link, role: to.role }, dedupeKey: tokenId })
  return { tokenId, link, expiresAt }
}
