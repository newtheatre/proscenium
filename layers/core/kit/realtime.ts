// Realtime: news pushed to open pages over a WebSocket, so two devices need not ask to stay in step.
// A room is one RealtimeHub Durable Object (binding REALTIME); every account has its own, which its
// devices join. A page asks for a ticket, a short-lived signed claim to a room, and opens
// /api/realtime with it; the Worker's entry checks the ticket and hands the socket to the room.
// Server code calls publish() once its change is committed. News is a hint to read again, never the
// record: a missed message costs a page nothing but the wait for its next ordinary read.
import { useContext, useEnv } from './context'
import { nowMs } from './clock'
import { log } from './log'

export interface RealtimeTicket {
  room: string
  /** Who the socket is, for the room's own messages: the account and its sign-in session. */
  accountId: string
  sessionId: string | null
  /** When the ticket stops opening sockets, in UTC milliseconds. */
  expires: number
}

/** How long a ticket opens a socket for: long enough to connect, too short to pass on. */
export const TICKET_LIFE = 60_000 // not-policy: a ticket is used within moments of being issued

const encoder = new TextEncoder()
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

async function mac(key: string, body: string, domain = 'realtime-ticket'): Promise<string> {
  // Its own domain, so a ticket's signature is no use as a grant's, or as any other value signed with the key.
  const hmac = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', hmac, encoder.encode(`${domain}:${body}`))))
}
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let differs = 0
  for (let i = 0; i < a.length; i++) differs |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return !differs
}

/** Signs a ticket with the session key. The key is passed in: the Worker's entry has no context. */
export async function signTicket(key: string, ticket: RealtimeTicket): Promise<string> {
  const body = b64(encoder.encode(JSON.stringify(ticket)))
  return `${body}.${await mac(key, body)}`
}

/** The ticket's claims, or null when it is not ours, was changed, or has run out. */
export async function readTicket(key: string, value: string, at: number): Promise<RealtimeTicket | null> {
  const [body, signature, ...rest] = value.split('.')
  if (!body || !signature || rest.length) return null
  if (!same(await mac(key, body), signature)) return null
  try {
    const ticket = JSON.parse(new TextDecoder().decode(unb64(body))) as RealtimeTicket
    return typeof ticket.room === 'string' && typeof ticket.expires === 'number' && ticket.expires > at ? ticket : null
  }
  catch { return null }
}

/** The room every device signed in to this account joins. */
export const accountRoom = (accountId: string) => `account:${accountId}`

interface Hub { publish: (message: string) => Promise<void>, hold: (value: string, until: number, at: number) => Promise<boolean>, held: (at: number) => Promise<string | null> }

/** Whether this Worker can push at all. Not under nuxt dev, where pages keep asking instead. */
export function realtimeAvailable(): boolean {
  return !!useEnv().REALTIME
}

/**
 * Tells every socket in a room that something on `channel` changed. Call it after the commit
 * (unit.afterCommit). It never throws: a room that cannot be reached leaves pages to their own reads.
 */
export async function publish(room: string, channel: string, data: unknown = null): Promise<void> {
  const namespace = useEnv().REALTIME
  if (!namespace) return
  try {
    await (namespace.get(namespace.idFromName(room)) as unknown as Hub).publish(JSON.stringify({ channel, data }))
  }
  catch (error) {
    log.warn('core.realtime.publish-failed', { channel, error: String((error as Error)?.message ?? error) })
  }
}

/** A ticket to the signed-in account's own room. */
export async function ownTicket(accountId: string, sessionId: string | null, at: number): Promise<string> {
  return signTicket(sessionKey(), { room: accountRoom(accountId), accountId, sessionId, expires: at + TICKET_LIFE })
}

function sessionKey(): string {
  const key = useContext().env.CORE_SESSION_KEY
  if (typeof key !== 'string' || !key) throw new Error('CORE_SESSION_KEY is not set. Add it as a Worker secret (any long random string).')
  return key
}

/** A pass to another account's room: who may join, which room, and until when. */
export interface RealtimeGrant { room: string, accountId: string, expires: number }

/**
 * Signs a grant. A module gives one to an account it has decided may join another's room, such as
 * a seller who typed a till's link code; the page keeps it and trades it for tickets.
 */
export async function signGrant(grant: RealtimeGrant): Promise<string> {
  const body = b64(encoder.encode(JSON.stringify(grant)))
  return `${body}.${await mac(sessionKey(), body, 'realtime-grant')}`
}

/** A ticket to the room a grant is a pass to, or null when the grant is not this account's, was changed or has run out. */
export async function grantTicket(value: string, accountId: string, sessionId: string | null, at: number): Promise<string | null> {
  const [body, signature, ...rest] = value.split('.')
  if (!body || !signature || rest.length || !same(await mac(sessionKey(), body, 'realtime-grant'), signature)) return null
  let grant: RealtimeGrant
  try { grant = JSON.parse(new TextDecoder().decode(unb64(body))) as RealtimeGrant }
  catch { return null }
  if (grant.accountId !== accountId || !(grant.expires > at)) return null
  return signTicket(sessionKey(), { room: grant.room, accountId, sessionId, expires: Math.min(at + TICKET_LIFE, grant.expires) })
}

const hub = (name: string) => {
  const namespace = useEnv().REALTIME
  return namespace ? namespace.get(namespace.idFromName(name)) as unknown as Hub : null
}

/**
 * Holds a value under a short code until a time, for someone to read by typing the code: a strongly
 * consistent, self-expiring slot with no table behind it. False when the code is already taken.
 */
export async function holdUnder(code: string, value: string, until: number): Promise<boolean> {
  return await hub(`held:${code}`)?.hold(value, until, nowMs()) ?? false
}

/** What is held under a code, or null when nothing is or it has run out. */
export async function heldUnder(code: string): Promise<string | null> {
  return await hub(`held:${code}`)?.held(nowMs()) ?? null
}
