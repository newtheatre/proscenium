// One room of the realtime service (#kit/realtime): it holds the open sockets of the devices in it
// and passes news on to all of them. Sockets hibernate, so a quiet room costs nothing, and "ping"
// is answered without waking it.
import { DurableObject } from 'cloudflare:workers'
import { readTicket } from '#kit/realtime'
import type { KitEnv } from '#kit/context'

/** Who a socket is: read from its ticket, with the device's own id and name. */
interface Seat { accountId: string, sessionId: string | null, deviceId: string, name: string }
interface Kept { data: unknown, from: string | null }

const MESSAGE_LIMIT = 65_536 // not-policy: the largest message a device may send a room, in characters
const NAME_LIMIT = 60 // not-policy: the longest name a device may give itself
const PRESENCE = 'core.presence'

export class RealtimeHub extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 }) // not-policy: HTTP's "upgrade required"
    const pair = new WebSocketPair()
    const seat: Seat = {
      accountId: request.headers.get('x-realtime-account') ?? '',
      sessionId: request.headers.get('x-realtime-session') || null,
      deviceId: (request.headers.get('x-realtime-device') || crypto.randomUUID()).slice(0, NAME_LIMIT),
      name: decodeURIComponent(request.headers.get('x-realtime-name') ?? '').slice(0, NAME_LIMIT),
    }
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment(seat)
    this.tellPresence()
    return new Response(null, { status: 101, webSocket: pair[0] }) // not-policy: HTTP's "switching protocols"
  }

  /** Sends one message to every socket in the room. A socket that cannot take it is closed. */
  async publish(message: string, except?: WebSocket): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue
      try { socket.send(message) }
      catch { socket.close(1011, 'Delivery failed') } // not-policy: WebSocket's "internal error"
    }
  }

  /** The devices in the room, one entry each however many pages a device has open. */
  devices(leaving?: WebSocket): { id: string, name: string, accountId: string }[] {
    const seen = new Map<string, { id: string, name: string, accountId: string }>()
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === leaving) continue
      const seat = socket.deserializeAttachment() as Seat | null
      if (seat) seen.set(seat.deviceId, { id: seat.deviceId, name: seat.name, accountId: seat.accountId })
    }
    return [...seen.values()]
  }

  private tellPresence(leaving?: WebSocket): void {
    void this.publish(JSON.stringify({ channel: PRESENCE, data: { devices: this.devices(leaving) } }), leaving)
  }

  /**
   * A device's own messages. `{ ask }` is answered with what the room keeps for a channel (and who
   * is here, for core.presence); `{ name }` renames the device; `{ channel, data, keep }` is passed
   * to the room's other sockets, and kept for later arrivals, while anyone is in the room, when `keep` is set.
   */
  override async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MESSAGE_LIMIT) return
    const seat = socket.deserializeAttachment() as Seat | null
    let message: { ask?: unknown, name?: unknown, channel?: unknown, data?: unknown, keep?: unknown }
    try { message = JSON.parse(raw) }
    catch { return }
    if (!seat || !message || typeof message !== 'object') return
    if (typeof message.ask === 'string') {
      if (message.ask === PRESENCE) return socket.send(JSON.stringify({ channel: PRESENCE, data: { devices: this.devices() } }))
      const kept = await this.ctx.storage.get<Kept>(`kept:${message.ask}`)
      return socket.send(JSON.stringify({ channel: message.ask, data: kept?.data ?? null, from: kept?.from ?? null, kept: true }))
    }
    if (typeof message.name === 'string') {
      socket.serializeAttachment({ ...seat, name: message.name.slice(0, NAME_LIMIT) })
      return this.tellPresence()
    }
    // Channels with a dot in the first part's place are the server's to publish on, such as payments.session.
    if (typeof message.channel !== 'string' || !message.channel.startsWith('device.')) return
    if (message.keep) {
      await this.ctx.storage.put<Kept>(`kept:${message.channel}`, { data: message.data ?? null, from: seat.deviceId })
    }
    await this.publish(JSON.stringify({ channel: message.channel, data: message.data ?? null, from: seat.deviceId }), socket)
  }

  override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    // 1005 and 1006 report an abnormal end and may not be sent back.
    try { socket.close(code === 1005 || code === 1006 ? 1000 : code) } // not-policy: WebSocket close codes
    catch { /* already closed */ }
    await this.left(socket)
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    await this.left(socket)
  }

  /** A value held under this object's name until a time (#kit/realtime, holdUnder). False while another is held. */
  async hold(value: string, until: number, at: number): Promise<boolean> {
    const now = await this.ctx.storage.get<{ value: string, until: number }>('held')
    if (now && now.until > at) return false
    await this.ctx.storage.put('held', { value, until })
    await this.ctx.storage.setAlarm(until)
    return true
  }

  async held(at: number): Promise<string | null> {
    const now = await this.ctx.storage.get<{ value: string, until: number }>('held')
    return now && now.until > at ? now.value : null
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.delete('held')
  }

  /** The others are told; the last device out takes what the room kept with it, so nothing stale waits for the next. */
  private async left(socket: WebSocket): Promise<void> {
    if (this.ctx.getWebSockets().some(s => s !== socket)) this.tellPresence(socket)
    else await this.ctx.storage.deleteAll()
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
  // The device's own id and name, kept on the device: they only tell its pages from other devices'.
  headers.set('x-realtime-device', url.searchParams.get('device') ?? '')
  headers.set('x-realtime-name', encodeURIComponent(url.searchParams.get('name') ?? ''))
  return namespace.get(namespace.idFromName(ticket.room)).fetch(new Request('https://realtime/connect', { headers }))
}
