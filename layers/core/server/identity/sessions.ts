// Sessions: one row per signed-in browser. The cookie holds a random token; the row holds its
// keyed hash. Every request reads the row, so ending a session takes effect on the next request
// with no cache to wait out (ID-13, "ended session stops on next request").
import type { H3Event } from 'h3'
import { first, newId, nowMs, useContext, useSetting, type UnitView } from '#kit'
import { digest, randomToken } from './crypto'
import type { ProviderId } from './providers'
import { SESSION_COOKIE, readCookie, setSessionCookie, clearSessionCookie, deviceLabel } from './web'

/** How a session was proved. An outside provider is named by its id (`providers.ts`). */
export type Method = 'passkey' | 'link' | 'code' | 'setup' | 'recovery' | 'authenticator' | ProviderId
export type Assurance = 'basic' | 'strong'

export interface SessionRow {
  id: string
  account_id: string
  methods: string
  assurance: Assurance
  reasserted_at: number | null
  created_at: number
  last_seen_at: number
  expires_at: number
  ended_at: number | null
}

export interface CurrentSession {
  id: string
  accountId: string
  methods: Method[]
  assurance: Assurance
  reassertedAt: number | null
  /** A session made from a recovery code may only enrol a passkey. */
  limited: boolean
}

const SEEN_EVERY = 5 * 60_000 // not-policy: last-used time is shown to the minute; write it at most every five minutes

/**
 * Starts a session for a proven account, in the caller's unit. The cookie is set only once the
 * unit has committed, so a refused sign-in never leaves a cookie behind.
 */
export async function startSession(unit: UnitView, event: H3Event, options: { accountId: string, methods: Method[], assurance: Assurance }): Promise<{ sessionId: string }> {
  const token = randomToken()
  const at = nowMs()
  const lifetime = await useSetting('core.sessions.lifetime') as number
  const id = newId('ses', { random: true })
  unit.add({
    sql: 'INSERT INTO core_sessions (id, account_id, token_hash, methods, assurance, reasserted_at, device, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, options.accountId, await digest('session', token), JSON.stringify(options.methods), options.assurance, at, deviceLabel(event), at, at, at + lifetime * 1000], // not-policy: seconds to milliseconds
  })
  unit.add({ sql: 'UPDATE core_accounts SET last_signed_in_at = ? WHERE id = ?', params: [at, options.accountId] })
  unit.afterCommit(() => setSessionCookie(event, token, lifetime))
  return { sessionId: id }
}

/** Ends this browser's session, in the caller's unit, and clears its cookie. */
export function endCurrentSession(unit: UnitView, event: H3Event, sessionId: string, reason: 'signed_out' | 'credential_changed' = 'signed_out'): void {
  unit.add({ sql: 'UPDATE core_sessions SET ended_at = ?, ended_reason = ? WHERE id = ? AND ended_at IS NULL', params: [nowMs(), reason, sessionId] })
  unit.afterCommit(() => clearSessionCookie(event))
}

/** Ends every live session of an account, optionally keeping one, in the caller's unit. */
export function endSessionsOf(unit: UnitView, accountId: string, reason: 'ended_by_person' | 'ended_by_staff' | 'credential_changed' | 'disabled' | 'merged' | 'erased', keep?: string): void {
  unit.add({
    sql: `UPDATE core_sessions SET ended_at = ?, ended_reason = ? WHERE account_id = ? AND ended_at IS NULL${keep ? ' AND id <> ?' : ''}`,
    params: keep ? [nowMs(), reason, accountId, keep] : [nowMs(), reason, accountId],
  })
}

/**
 * The session this request carries, if it is live: not ended, not past its lifetime or idle limit,
 * and on an account that can act. Read once per request.
 */
export async function currentSession(event: H3Event): Promise<CurrentSession | null> {
  const context = useContext()
  // The promise is kept, so calls that arrive together (a page's server render makes several) share one read.
  const found = await ((context.cache.identitySession as Promise<CurrentSession | null> | undefined) ?? (context.cache.identitySession = readSession(event)))
  ;(event.context as any).identitySession = found
  return found
}

async function readSession(event: H3Event): Promise<CurrentSession | null> {
  const token = readCookie(event, SESSION_COOKIE)
  if (!token || token.length > 100) return null // not-policy: a session token is 43 characters
  const at = nowMs()
  const row = await first<SessionRow & { disabled_at: number | null, merged_into_id: string | null, anonymised_at: number | null, first_signed_in_at: number | null }>(
    `SELECT s.*, a.disabled_at, a.merged_into_id, a.anonymised_at, a.first_signed_in_at
       FROM core_sessions s JOIN core_accounts a ON a.id = s.account_id
      WHERE s.token_hash = ?`,
    await digest('session', token),
  )
  if (!row || row.ended_at || row.expires_at <= at) return null
  if (row.disabled_at || row.merged_into_id || row.anonymised_at || !row.first_signed_in_at) return null
  const idle = await useSetting('core.sessions.idle-limit') as number
  if (row.last_seen_at + idle * 1000 <= at) return null // not-policy: seconds to milliseconds
  if (at - row.last_seen_at > SEEN_EVERY) {
    await useContext().env.DB.prepare('UPDATE core_sessions SET last_seen_at = ? WHERE id = ? AND ended_at IS NULL').bind(at, row.id).run()
  }
  const methods = JSON.parse(row.methods) as Method[]
  return { id: row.id, accountId: row.account_id, methods, assurance: row.assurance, reassertedAt: row.reasserted_at, limited: methods.includes('recovery') }
}

// Marks this session as freshly re-asserted, and strong when the proof was strong (ID-28).
export function reassert(unit: UnitView, sessionId: string, method: Method, strong: boolean): void {
  unit.add({
    sql: `UPDATE core_sessions SET reasserted_at = ?, methods = CASE WHEN instr(methods, ?) > 0 THEN methods ELSE json_insert(methods, '$[#]', ?) END${strong ? ', assurance = \'strong\'' : ''} WHERE id = ? AND ended_at IS NULL`,
    params: [nowMs(), `"${method}"`, method, sessionId],
  }).expect(1)
}
