// One room of the realtime service (#kit/realtime): it holds the open sockets of the devices in it
// and passes news on to all of them. Sockets hibernate, so a quiet room costs nothing, and "ping"
// is answered without waking it.
import { DurableObject } from 'cloudflare:workers'
import { readTicket } from '#kit/realtime'
import type { KitEnv } from '#kit/context'

export class RealtimeHub extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 }) // not-policy: HTTP's "upgrade required"
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ accountId: request.headers.get('x-realtime-account'), sessionId: request.headers.get('x-realtime-session') })
    return new Response(null, { status: 101, webSocket: pair[0] }) // not-policy: HTTP's "switching protocols"
  }

  /** Sends one message to every socket in the room. A socket that cannot take it is closed. */
  async publish(message: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message) }
      catch { socket.close(1011, 'Delivery failed') } // not-policy: WebSocket's "internal error"
    }
  }

  override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    // 1005 and 1006 report an abnormal end and may not be sent back.
    try { socket.close(code === 1005 || code === 1006 ? 1000 : code) } // not-policy: WebSocket close codes
    catch { /* already closed */ }
  }
}

/**
 * Answers /api/realtime for the Worker's entry: a WebSocket from this site with a ticket that reads
 * is handed to the ticket's room. Nitro is not asked, since it cannot pass a socket back.
 */
export async function connectRealtime(request: Request, env: KitEnv, at = Date.now()): Promise<Response> {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 }) // not-policy: HTTP's "upgrade required"
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  // A browser always says where the page is from; another site's page may not open this socket.
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== url.host)) return new Response('Another site may not connect', { status: 403 }) // not-policy: HTTP's "forbidden"
  const key = env.CORE_SESSION_KEY
  const ticket = typeof key === 'string' && key ? await readTicket(key, url.searchParams.get('ticket') ?? '', at) : null
  const namespace = env.REALTIME
  if (!ticket || !namespace) return new Response('Sign in again', { status: 401 }) // not-policy: HTTP's "unauthorised"
  const headers = new Headers(request.headers)
  headers.set('x-realtime-account', ticket.accountId)
  headers.set('x-realtime-session', ticket.sessionId ?? '')
  return namespace.get(namespace.idFromName(ticket.room)).fetch(new Request('https://realtime/connect', { headers }))
}
