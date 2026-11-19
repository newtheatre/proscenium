// Realtime: news pushed to open pages over a WebSocket, so two devices need not ask to stay in step.
// A room is one RealtimeHub Durable Object (binding REALTIME); every account has its own, which its
// devices join. A page asks for a ticket, a short-lived signed claim to a room, and opens
// /api/realtime with it; the Worker's entry checks the ticket and hands the socket to the room.
// Server code calls publish() once its change is committed. News is a hint to read again, never the
// record: a missed message costs a page nothing but the wait for its next ordinary read.
import { useContext, useEnv } from './context'
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

async function mac(key: string, body: string): Promise<string> {
  // Its own domain, so a ticket's signature is no use as any other value signed with the key.
  const hmac = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', hmac, encoder.encode(`realtime-ticket:${body}`))))
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
  const expected = await mac(key, body)
  if (expected.length !== signature.length) return null
  let differs = 0
  for (let i = 0; i < expected.length; i++) differs |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  if (differs) return null
  try {
    const ticket = JSON.parse(new TextDecoder().decode(unb64(body))) as RealtimeTicket
    return typeof ticket.room === 'string' && typeof ticket.expires === 'number' && ticket.expires > at ? ticket : null
  }
  catch { return null }
}

/** The room every device signed in to this account joins. */
export const accountRoom = (accountId: string) => `account:${accountId}`

interface Hub { publish: (message: string) => Promise<void> }

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
  const key = useContext().env.CORE_SESSION_KEY
  if (typeof key !== 'string' || !key) throw new Error('CORE_SESSION_KEY is not set. Add it as a Worker secret (any long random string).')
  return signTicket(key, { room: accountRoom(accountId), accountId, sessionId, expires: at + TICKET_LIFE })
}
