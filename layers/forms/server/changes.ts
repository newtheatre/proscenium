// The emailed link for sending changes (R-19). Somebody who answered signed out has no My forms to
// come back to, so each time their response is returned for changes they are emailed a fresh link
// to it. The link's token is made by the kit and sent once; only its keyed hash is stored, with when
// it stops working. A new link replaces the one before. Through it the person reads their response
// and the note to them as often as they like, and sends their changes once: every move clears the
// link, so the move their changes make spends it.
import { first, linkTokens, siteUrl, useSetting, type UnitView } from '#kit'
import { getResponse, type ResponseRow } from './responses'

const SECOND = 1000 // not-policy: settings are whole seconds

/** Makes a new link for this response, replacing any before it, and returns its address to email. */
export async function issueChangeLink(unit: UnitView, responseId: string, at: number): Promise<string> {
  const { token, hash } = await linkTokens.issue()
  const lifetime = (await useSetting('forms.changes.link-lifetime') as number) * SECOND
  unit.add({ sql: 'UPDATE forms_responses SET change_token_hash = ?, change_token_expires_at = ? WHERE id = ? AND person_id IS NULL', params: [hash, at + lifetime, responseId] })
  return siteUrl(`/forms/changes/${token}`)
}

/** The response a link opens, while it works: unspent, in time, and the response still answered signed out. */
export async function responseByChangeLink(token: string, at: number): Promise<{ response: ResponseRow, hash: string, expiresAt: number } | null> {
  if (!token) return null
  const hash = await linkTokens.hash(token)
  const row = await first<{ id: string, expiresAt: number }>(
    'SELECT id, change_token_expires_at AS expiresAt FROM forms_responses WHERE change_token_hash = ? AND change_token_expires_at > ? AND state = \'submitted\' AND person_id IS NULL AND respondent_email IS NOT NULL AND anonymised_at IS NULL', hash, at)
  const response = row ? await getResponse(row.id) : null
  return response && row ? { response, hash, expiresAt: row.expiresAt } : null
}

/** Spends the link in the unit that sends the changes: a second sending with it finds nothing to spend. */
export function spendChangeLink(unit: UnitView, responseId: string, hash: string): void {
  unit.add({ sql: 'UPDATE forms_responses SET change_token_hash = NULL, change_token_expires_at = NULL WHERE id = ? AND change_token_hash = ?', params: [responseId, hash] })
    .expect(1, { code: 'forms.changes.spent', reason: 'This link has already been used.', remedy: 'Reply to the email the theatre sent you and quote your reference.' })
}
