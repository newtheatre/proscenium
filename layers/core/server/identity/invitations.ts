// Invitations (ID-06): a role given to somebody who has never signed in. The grant is written at
// once and counts for nothing until they claim the account; the invitation is a single-use link
// that signs them in and so claims it. After the link lapses an ordinary sign-in with the same
// address does the same, because the grant waits on the account, not on the link.
import type { H3Event } from 'h3'
import { newId, nowMs, useSetting, type Actor, type UnitView } from '#kit'
import { digest, randomToken } from './crypto'
import { relyingParty } from './web'

export interface Invitation { tokenId: string, link: string }

/** Writes the invitation's token and returns the link to send. */
export async function createInvitation(unit: UnitView, event: H3Event, actor: Actor, to: { accountId: string, address: string }): Promise<Invitation> {
  const token = randomToken()
  const tokenId = newId('tok', { random: true })
  const at = nowMs()
  const lifetime = await useSetting('core.sign-in.invite-lifetime') as number
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, account_id, address, issued_by, attempts, created_at, expires_at)
          VALUES (?, 'invite', ?, ?, ?, ?, 0, ?, ?)`,
    params: [tokenId, await digest('link', token), to.accountId, to.address, actor.accountId ?? null, at, at + lifetime * 1000], // not-policy: seconds to milliseconds
  })
  return { tokenId, link: `${relyingParty(event).origin}/sign-in/link#${token}` }
}
