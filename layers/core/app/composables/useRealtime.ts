// News from the server over one WebSocket for the page (#kit/realtime), shared by everything on it
// that listens. A listener is told that its channel changed and reads again; it is also told, with
// no data, when the socket comes back, since news may have been missed. `connected` lets a page
// that polls slow down or stop while news is arriving, and carry on by itself when it is not.
const HEARTBEAT = 25_000 // not-policy: keeps the socket from being dropped as idle
const RETRY_FROM = 1000 // not-policy: the first wait before connecting again
const RETRY_UP_TO = 30_000 // not-policy: the longest wait before connecting again

type Listener = (data: unknown) => void
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
    const mine = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/realtime?ticket=${encodeURIComponent(ticket)}`)
    socket = mine
    mine.onopen = () => {
      if (socket !== mine) return
      const again = attempt > 0
      attempt = 0
      connected.value = true
      heartbeat = setInterval(() => { if (mine.readyState === WebSocket.OPEN) mine.send('ping') }, HEARTBEAT)
      if (again) for (const set of listeners.values()) for (const tell of set) tell(null)
    }
    mine.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return
      try {
        const { channel, data } = JSON.parse(event.data) as { channel: string, data: unknown }
        for (const tell of listeners.get(channel) ?? []) tell(data)
      }
      catch { /* not news */ }
    }
    mine.onclose = () => {
      if (socket !== mine) return
      clearInterval(heartbeat)
      socket = null
      connected.value = false
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

/** Listens to a channel while the calling component is shown. `on` gets the news, or null after a gap. */
export function useRealtime(channel: string, on: Listener) {
  if (!import.meta.client) return { connected: readonly(connected) }
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
    void open()
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', visible)
    listeners.get(channel)?.delete(on)
    if (!listeners.get(channel)?.size) listeners.delete(channel)
    if (!listeners.size) stop()
  })
  return { connected: readonly(connected) }
}
