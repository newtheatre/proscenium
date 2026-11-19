// News from the server over a WebSocket (#kit/realtime), shared by everything on the page that
// listens. A listener is told that its channel changed and reads again; it is also told, with no
// data, when the socket comes back, since news may have been missed. `connected` lets a page that
// polls slow down or stop while news is arriving, and carry on by itself when it is not.
//
// Devices in the room can also talk to each other on channels named `device.*`: `send` passes a
// message to the others, and with `keep` the room holds it for a device that arrives later, which
// gets it (marked `kept`) when it starts listening. `devices` is who is in the room now. A device
// is a browser: its id and its name are kept in its own storage.
//
// The room is the signed-in account's own, unless the listener is given a grant: a pass to another
// account's room, issued by a module (the till's link code). A page holds one socket for each room
// it listens in.
import type { Ref } from 'vue'

const HEARTBEAT = 25_000 // not-policy: keeps the socket from being dropped as idle
const RETRY_FROM = 1000 // not-policy: the first wait before connecting again
const RETRY_UP_TO = 30_000 // not-policy: the longest wait before connecting again

export interface RealtimeDevice { id: string, name: string, accountId: string }
/** What came with a message: the device that sent it, and whether the room had kept it. */
export interface RealtimeMeta { from: string | null, kept: boolean }
type Listener = (data: unknown, meta: RealtimeMeta) => void
type Ticket = { available: boolean, ticket: string | null, refused?: boolean }
const NONE: RealtimeMeta = { from: null, kept: false }
const PRESENCE = 'core.presence'
const DEVICE_ID = 'core.device.id'
const DEVICE_NAME = 'core.device.name'
const deviceName = ref('')
let deviceId = ''

/** "Chrome on macOS": enough to tell a seller's laptop from their phone until they name them. */
function describeDevice(): string {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const system = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return system ? `${browser} on ${system}` : browser
}
function identify() {
  if (deviceId) return
  try {
    deviceId = localStorage.getItem(DEVICE_ID) ?? ''
    if (!deviceId) localStorage.setItem(DEVICE_ID, deviceId = crypto.randomUUID())
    deviceName.value = localStorage.getItem(DEVICE_NAME) || describeDevice()
  }
  catch {
    // Storage refused: the device is a new one each time the page loads.
    deviceId ||= crypto.randomUUID()
    deviceName.value ||= describeDevice()
  }
}

/** One room's socket, opened while anything listens in the room. */
function connection(fetchTicket: () => Promise<Ticket>) {
  const listeners = new Map<string, Set<Listener>>()
  const connected = ref(false)
  /** The pass to the room was refused, as when it has run out: the listener should give it up. */
  const refused = ref(false)
  const devices = ref<RealtimeDevice[]>([])
  let socket: WebSocket | null = null
  let opening = false
  let unavailable = false
  let attempt = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  function post(message: unknown) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }
  function stop() {
    clearTimeout(retry)
    clearInterval(heartbeat)
    retry = heartbeat = undefined
    const was = socket
    socket = null
    connected.value = false
    devices.value = []
    was?.close()
  }
  function later() {
    clearTimeout(retry)
    if (!listeners.size || unavailable) return
    retry = setTimeout(open, Math.min(RETRY_FROM * 2 ** attempt++, RETRY_UP_TO))
  }
  async function open() {
    if (socket || opening || unavailable || !listeners.size) return
    opening = true
    try {
      const { available, ticket, refused: no } = await fetchTicket()
      if (!available || !ticket) {
        // This server cannot push, or the pass is no good: the page keeps to its own reads and does not ask again.
        unavailable = true
        refused.value = !!no
        return
      }
      if (!listeners.size) return
      identify()
      const query = new URLSearchParams({ ticket, device: deviceId, name: deviceName.value })
      const mine = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/realtime?${query}`)
      socket = mine
      mine.onopen = () => {
        if (socket !== mine) return
        const again = attempt > 0
        attempt = 0
        connected.value = true
        heartbeat = setInterval(() => { if (mine.readyState === WebSocket.OPEN) mine.send('ping') }, HEARTBEAT)
        post({ ask: PRESENCE })
        for (const channel of listeners.keys()) if (channel.startsWith('device.')) post({ ask: channel })
        if (again) for (const set of listeners.values()) for (const tell of set) tell(null, NONE)
      }
      mine.onmessage = (event) => {
        if (typeof event.data !== 'string' || event.data === 'pong') return
        try {
          const { channel, data, from, kept } = JSON.parse(event.data) as { channel: string, data: unknown, from?: string | null, kept?: boolean }
          if (channel === PRESENCE) devices.value = (data as { devices: RealtimeDevice[] }).devices
          for (const tell of listeners.get(channel) ?? []) tell(data, { from: from ?? null, kept: !!kept })
        }
        catch { /* not news */ }
      }
      mine.onclose = () => {
        if (socket !== mine) return
        clearInterval(heartbeat)
        socket = null
        connected.value = false
        devices.value = []
        attempt ||= 1
        later()
      }
    }
    catch {
      attempt ||= 1
      later()
    }
    finally {
      opening = false
    }
  }
  function listen(channel: string, on: Listener) {
    if (!listeners.has(channel)) listeners.set(channel, new Set())
    listeners.get(channel)!.add(on)
    if (channel.startsWith('device.')) post({ ask: channel })
    void open()
  }
  function leave(channel: string, on: Listener) {
    listeners.get(channel)?.delete(on)
    if (!listeners.get(channel)?.size) listeners.delete(channel)
    if (!listeners.size) stop()
  }
  /** The page is shown again: a socket that was dropped while it was hidden is opened now, not later. */
  function wake() {
    if (socket || !listeners.size) return
    attempt ||= 1
    clearTimeout(retry)
    void open()
  }
  return { connected, refused, devices, post, listen, leave, wake }
}
type Connection = ReturnType<typeof connection>
// The account's own room, and each other room this page holds a grant to.
const rooms = new Map<string, Connection>()

/**
 * Listens to a channel while the calling component is shown. `on` gets the news, or null after a
 * gap. With `grant`, it listens in the room the grant is a pass to while the ref holds one, and in
 * the account's own room while it holds none.
 */
export function useRealtime(channel: string, on: Listener, options: { grant?: Ref<string | null> } = {}) {
  const current = shallowRef<Connection | null>(null)
  const connected = computed(() => !!current.value?.connected.value)
  const refused = computed(() => !!current.value?.refused.value)
  const devices = computed<RealtimeDevice[]>(() => current.value?.devices.value ?? [])
  /** Passes a message to the room's other devices on this (device.*) channel; `keep` holds it for later arrivals. */
  const send = (data: unknown, extra: { keep?: boolean } = {}) => current.value?.post({ channel, data, keep: !!extra.keep })
  /** Asks the room again for what it keeps on this channel, which arrives marked `kept`. */
  const ask = () => current.value?.post({ ask: channel })
  /** Renames this device, for every device in its rooms and for next time. */
  function rename(name: string) {
    deviceName.value = name.trim() || describeDevice()
    try { localStorage.setItem(DEVICE_NAME, name.trim()) }
    catch { /* storage refused: the name lasts until the page is closed */ }
    for (const room of rooms.values()) room.post({ name: deviceName.value })
  }
  const shared = { connected, refused, devices, deviceName: readonly(deviceName), deviceId: () => deviceId, send, ask, rename }
  if (!import.meta.client) return shared

  const { $api } = useNuxtApp()
  function roomFor(grant: string | null): Connection {
    const key = grant ?? ''
    if (!rooms.has(key)) {
      rooms.set(key, connection(async () => {
        try {
          return await $api<Ticket>('/api/core/realtime/ticket', { method: 'POST', body: grant ? { grant } : {} })
        }
        catch (error) {
          // A grant that no longer reads is refused for good; anything else is tried again.
          if (grant && (error as { statusCode?: number })?.statusCode === 403) return { available: false, ticket: null, refused: true } // not-policy: HTTP's "forbidden"
          throw error
        }
      }))
    }
    return rooms.get(key)!
  }
  function join(grant: string | null) {
    const next = roomFor(grant)
    if (current.value === next) return
    current.value?.leave(channel, on)
    current.value = next
    next.listen(channel, on)
  }
  const visible = () => { if (document.visibilityState === 'visible') current.value?.wake() }
  let mounted = false
  onMounted(() => {
    mounted = true
    identify()
    document.addEventListener('visibilitychange', visible)
    join(options.grant?.value ?? null)
  })
  if (options.grant) watch(options.grant, (grant) => { if (mounted) join(grant ?? null) })
  onBeforeUnmount(() => {
    mounted = false
    document.removeEventListener('visibilitychange', visible)
    current.value?.leave(channel, on)
    current.value = null
  })
  return shared
}
