// News from the server over one WebSocket for the page (#kit/realtime), shared by everything on it
// that listens. A listener is told that its channel changed and reads again; it is also told, with
// no data, when the socket comes back, since news may have been missed. `connected` lets a page
// that polls slow down or stop while news is arriving, and carry on by itself when it is not.
//
// Devices in the room can also talk to each other on channels named `device.*`: `send` passes a
// message to the others, and with `keep` the room holds it for a device that arrives later, which
// gets it (marked `kept`) when it starts listening. `devices` is who is in the room now. A device
// is a browser: its id and its name are kept in its own storage.
const HEARTBEAT = 25_000 // not-policy: keeps the socket from being dropped as idle
const RETRY_FROM = 1000 // not-policy: the first wait before connecting again
const RETRY_UP_TO = 30_000 // not-policy: the longest wait before connecting again

export interface RealtimeDevice { id: string, name: string, accountId: string }
/** What came with a message: the device that sent it, and whether the room had kept it. */
export interface RealtimeMeta { from: string | null, kept: boolean }
type Listener = (data: unknown, meta: RealtimeMeta) => void
const NONE: RealtimeMeta = { from: null, kept: false }
const PRESENCE = 'core.presence'
const DEVICE_ID = 'core.device.id'
const DEVICE_NAME = 'core.device.name'
const devices = ref<RealtimeDevice[]>([])
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
function post(message: unknown) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}
const listeners = new Map<string, Set<Listener>>()
const connected = ref(false)
let socket: WebSocket | null = null
let opening = false
let unavailable = false
let attempt = 0
let retry: ReturnType<typeof setTimeout> | undefined
let heartbeat: ReturnType<typeof setInterval> | undefined
let fetchTicket: (() => Promise<{ available: boolean, ticket: string | null }>) | null = null

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
  if (socket || opening || unavailable || !listeners.size || !fetchTicket) return
  opening = true
  try {
    const { available, ticket } = await fetchTicket()
    if (!available || !ticket) {
      // This server cannot push: the page keeps to its own reads and does not ask again.
      unavailable = true
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

/** Renames this device, for every device in the room and for next time. */
function rename(name: string) {
  deviceName.value = name.trim() || describeDevice()
  try { localStorage.setItem(DEVICE_NAME, name.trim()) }
  catch { /* storage refused: the name lasts until the page is closed */ }
  post({ name: deviceName.value })
}

/** Listens to a channel while the calling component is shown. `on` gets the news, or null after a gap. */
export function useRealtime(channel: string, on: Listener) {
  /** Passes a message to the room's other devices on this (device.*) channel; `keep` holds it for later arrivals. */
  const send = (data: unknown, options: { keep?: boolean } = {}) => post({ channel, data, keep: !!options.keep })
  /** Asks the room again for what it keeps on this channel, which arrives marked `kept`. */
  const ask = () => post({ ask: channel })
  const shared = { connected: readonly(connected), devices: readonly(devices), deviceName: readonly(deviceName), deviceId: () => deviceId, send, ask, rename }
  if (!import.meta.client) return shared
  const { $api } = useNuxtApp()
  fetchTicket ??= () => $api<{ available: boolean, ticket: string | null }>('/api/core/realtime/ticket', { method: 'POST', body: {} })
  const visible = () => {
    if (document.visibilityState !== 'visible' || socket) return
    attempt ||= 1
    clearTimeout(retry)
    void open()
  }
  onMounted(() => {
    if (!listeners.has(channel)) listeners.set(channel, new Set())
    listeners.get(channel)!.add(on)
    document.addEventListener('visibilitychange', visible)
    identify()
    if (channel.startsWith('device.')) post({ ask: channel })
    void open()
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', visible)
    listeners.get(channel)?.delete(on)
    if (!listeners.get(channel)?.size) listeners.delete(channel)
    if (!listeners.size) stop()
  })
  return shared
}
