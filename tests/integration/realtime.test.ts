// Realtime (#kit/realtime): a ticket opens a socket to one room only, for a short while, and what
// is published to a room reaches every socket in it and no other room's.
import { describe, expect, it } from 'vitest'
import { accountRoom, ownTicket, publish, readTicket, signTicket, TICKET_LIFE } from '#kit/realtime'
import { connectRealtime } from '../../layers/core/server/realtime-hub'
import ticketPost from '../../layers/core/server/api/core/realtime/ticket.post'
import { call, env, inContext, person, server } from './helpers'

const KEY = env.CORE_SESSION_KEY as string
const AT = Date.UTC(2026, 10, 19, 20)
const handle = server({ 'POST /api/core/realtime/ticket': ticketPost })

async function join(ticket: string, headers: Record<string, string> = {}) {
  const response = await connectRealtime(new Request(`https://theatre.test/api/realtime?ticket=${encodeURIComponent(ticket)}`, { headers: { upgrade: 'websocket', ...headers } }), env)
  const heard: string[] = []
  response.webSocket?.accept()
  response.webSocket?.addEventListener('message', (event) => { heard.push(event.data as string) })
  return { response, socket: response.webSocket, heard }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

describe('realtime tickets', () => {
  it('reads back what was signed, until it runs out', async () => {
    const ticket = await signTicket(KEY, { room: 'account:acc_a', accountId: 'acc_a', sessionId: 'ses_a', expires: AT + TICKET_LIFE })
    expect(await readTicket(KEY, ticket, AT)).toEqual({ room: 'account:acc_a', accountId: 'acc_a', sessionId: 'ses_a', expires: AT + TICKET_LIFE })
    expect(await readTicket(KEY, ticket, AT + TICKET_LIFE)).toBeNull()
  })

  it('refuses a ticket that was changed, or signed with another key', async () => {
    const ticket = await signTicket(KEY, { room: 'account:acc_a', accountId: 'acc_a', sessionId: null, expires: AT + TICKET_LIFE })
    const [, signature] = ticket.split('.')
    const forged = `${btoa(JSON.stringify({ room: 'account:acc_b', accountId: 'acc_a', sessionId: null, expires: AT + TICKET_LIFE }))}.${signature}`
    expect(await readTicket(KEY, forged, AT)).toBeNull()
    expect(await readTicket('another-key', ticket, AT)).toBeNull()
    expect(await readTicket(KEY, 'nonsense', AT)).toBeNull()
  })

  it('gives a signed-in person a ticket to their own room, and nobody else one', async () => {
    const me = person([])
    const response = await call(handle, 'POST', '/api/core/realtime/ticket', { actor: me, body: {} })
    const body = await response.json() as { available: boolean, ticket: string }
    expect(body.available).toBe(true)
    expect((await readTicket(KEY, body.ticket, Date.now()))?.room).toBe(accountRoom(me.accountId!))
    expect((await call(handle, 'POST', '/api/core/realtime/ticket', { body: {} })).status).toBe(401)
  })
})

describe('realtime rooms', () => {
  it('passes news to every socket in the room, and to no other room', async () => {
    const [a, b] = [person([]), person([])]
    const ticket = (who: typeof a) => inContext(() => ownTicket(who.accountId!, null, Date.now()))
    const [laptop, phone, other] = [await join(await ticket(a)), await join(await ticket(a)), await join(await ticket(b))]
    expect(laptop.response.status).toBe(101)
    await inContext(() => publish(accountRoom(a.accountId!), 'payments.session', { id: 1 }))
    await settle()
    expect(laptop.heard).toEqual([JSON.stringify({ channel: 'payments.session', data: { id: 1 } })])
    expect(phone.heard).toEqual(laptop.heard)
    expect(other.heard).toEqual([])
    for (const s of [laptop, phone, other]) s.socket?.close()
  })

  it('refuses a socket without a ticket that reads, a plain request, and another site\'s page', async () => {
    const me = person([])
    const good = await inContext(() => ownTicket(me.accountId!, null, Date.now()))
    expect((await join('nonsense')).response.status).toBe(401)
    expect((await join(await signTicket(KEY, { room: 'account:x', accountId: 'x', sessionId: null, expires: Date.now() - 1 }))).response.status).toBe(401)
    expect((await join(good, { origin: 'https://elsewhere.test' })).response.status).toBe(403)
    expect((await connectRealtime(new Request(`https://theatre.test/api/realtime?ticket=${good}`), env)).status).toBe(426)
  })
})
