// The door offline (D2, box office review). The live door keeps a copy of the performance's door on
// the device (useLiveData): the signing keys, each valid ticket's code hash and each booking. Offline
// it checks a door code's signature against those keys, as the server would, finds the ticket by its
// hash and admits it there; the admission waits on the device (useLiveQueue) and is sent when the
// connection returns, with an id made here so sending it twice admits nobody twice. A booking found
// by name is admitted the same way. What the door shows is shaped as the server's answers are.

interface Key { keyId: string, publicKey: string }
export interface PackBooking { id: string, reference: string, buyer: string | null, channel: string, at: number, tickets: number, admitted: number, unpaid?: { amountDueMinor: number, currency: string }, deskHash?: string }
interface Pack {
  performance: { id: string, title: string, label: string | null, startsAt: number, venue: string }
  madeAt: number
  keys: Key[]
  tickets: { hash: string, orderId: string, ticketType: string, in: boolean }[]
  bookings: PackBooking[]
}
type Item = { kind: 'code', id: string, code: string, at: number } | { kind: 'name', ids: string[], orderId: string, at: number }
interface Result { id: string, result: string, admitted?: number }

/** What the door shows for a code checked on the device: the server's shapes, plus `not_on_list`. */
export interface OfflineOutcome {
  result: 'admitted' | 'already_admitted' | 'bad_signature' | 'unknown' | 'not_on_list' | 'not_paid' | 'reference' | 'card_offline'
  booking?: { reference: string, buyer: string | null, ticketType: string, admitted: number, tickets: number }
  reservation?: { reference: string, buyer: string | null, tickets: number, amountDueMinor: number, currency: string }
  reference?: string
}

const TICKET_KIND = 'tkt' // not-policy: the ticket's kind in a door code, as tickets.ts makes it
const PARTS = 4 // not-policy: kind, key id, code and signature
const ID_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz' // not-policy: the kit's id alphabet (kit/ids.ts)
const TIME_CHARS = 10 // not-policy: the id format
const RANDOM_CHARS = 16 // not-policy: the id format

/** A scan id as the kit makes one (`scan_` and 26 characters, time first), made on the device. */
function newScanId(): string {
  let rest = Date.now()
  let time = ''
  for (let i = 0; i < TIME_CHARS; i++) {
    time = ID_ALPHABET[rest % ID_ALPHABET.length] + time
    rest = Math.floor(rest / ID_ALPHABET.length)
  }
  const random = [...crypto.getRandomValues(new Uint8Array(RANDOM_CHARS))].map(b => ID_ALPHABET[b % ID_ALPHABET.length]).join('')
  return `scan_${time}${random}`
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\w-]*$/.test(text)) return null
  try {
    return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  }
  catch {
    return null
  }
}
/** The hash the server keeps a code by (codes.ts hashOf). */
async function hashOf(value: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

const imported = new Map<string, Promise<CryptoKey>>()
async function verify(key: Key, data: string, signature: string): Promise<boolean> {
  const raw = fromBase64Url(key.publicKey)
  const bytes = fromBase64Url(signature)
  if (!raw || !bytes || bytes.length !== 64) return false // not-policy: a P-256 signature is 64 bytes
  try {
    let cryptoKey = imported.get(key.keyId)
    if (!cryptoKey) {
      cryptoKey = crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      imported.set(key.keyId, cryptoKey)
    }
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await cryptoKey, bytes, new TextEncoder().encode(data))
  }
  catch {
    return false
  }
}

export function useOfflineDoor(performanceId: MaybeRefOrGetter<string>, options: { onSent?: (results: Result[]) => void } = {}) {
  const { $api } = useNuxtApp()
  const base = () => `/api/box-office/performances/${encodeURIComponent(toValue(performanceId))}`
  // Fetched again every few minutes while online, so tickets sold or admitted elsewhere are known.
  const copy = useLiveData<Pack>(`box-office:door:${toValue(performanceId)}`, () => `${base()}/door/offline`, { every: 120_000 }) // not-policy: how often the copy is renewed
  const queue = useLiveQueue<Item, { results: Result[] }>(
    `box-office:door:${toValue(performanceId)}`,
    items => $api<{ results: Result[] }>(`${base()}/door/offline`, { method: 'POST', body: { items } }),
    {
      onSent: (_items, answer) => {
        options.onSent?.(answer.results)
        void copy.refresh()
      },
    },
  )

  /** The counts as this device knows them: what the server last said, with what was admitted here since. */
  const summary = computed(() => {
    const pack = copy.data.value
    if (!pack) return null
    const unpaid = pack.bookings.filter(b => b.unpaid).reduce((n, b) => n + b.tickets, 0)
    return { tickets: pack.tickets.length, admitted: pack.tickets.filter(t => t.in).length, unpaid }
  })

  function bookingOf(orderId: string, ticketType: string): OfflineOutcome['booking'] {
    const b = copy.data.value?.bookings.find(x => x.id === orderId)
    return b ? { reference: b.reference, buyer: b.buyer, ticketType, admitted: b.admitted, tickets: b.tickets } : undefined
  }

  /** Marks tickets in on the device's copy. */
  function markIn(orderId: string, hashes: string[]) {
    copy.update(pack => ({
      ...pack,
      tickets: pack.tickets.map(t => hashes.includes(t.hash) ? { ...t, in: true } : t),
      bookings: pack.bookings.map(b => b.id === orderId ? { ...b, admitted: Math.min(b.tickets, b.admitted + hashes.length) } : b),
    }))
  }

  /** Checks a code on the device and, for a ticket not yet in, admits it here and keeps it to send. */
  async function check(code: string): Promise<OfflineOutcome> {
    const pack = copy.data.value
    if (!pack) return { result: 'unknown' }
    const parts = code.trim().split('.')
    if (parts.length === PARTS) {
      const [kind, keyId, random, signature] = parts as [string, string, string, string]
      // A membership card or another module's code needs its module, which needs the connection.
      if (kind !== TICKET_KIND) return { result: 'card_offline' }
      const key = pack.keys.find(k => k.keyId === keyId)
      if (!key || !await verify(key, `${kind}.${keyId}.${random}`, signature)) return { result: 'bad_signature' }
      const hash = await hashOf(random)
      const ticket = pack.tickets.find(t => t.hash === hash)
      // Genuine, but not one of this door's: another night's, or sold since the copy was made.
      if (!ticket) return { result: 'not_on_list' }
      if (ticket.in) return { result: 'already_admitted', booking: bookingOf(ticket.orderId, ticket.ticketType) }
      queue.add({ kind: 'code', id: newScanId(), code: code.trim(), at: Date.now() })
      markIn(ticket.orderId, [hash])
      return { result: 'admitted', booking: bookingOf(ticket.orderId, ticket.ticketType) }
    }
    // A booking reference or a reservation's desk code.
    const typed = code.trim().toUpperCase()
    const deskHash = await hashOf(typed)
    const booking = pack.bookings.find(b => b.reference === typed || (b.deskHash && b.deskHash === deskHash))
    if (!booking) return { result: 'not_on_list' }
    if (booking.unpaid) return { result: 'not_paid', reservation: { reference: booking.reference, buyer: booking.buyer, tickets: booking.tickets, amountDueMinor: booking.unpaid.amountDueMinor, currency: booking.unpaid.currency } }
    return { result: 'reference', reference: booking.reference }
  }

  /** Bookings on the device's copy whose reference or buyer matches what was typed. */
  function find(text: string): PackBooking[] {
    const q = text.trim().toLowerCase()
    if (!q) return []
    return (copy.data.value?.bookings ?? []).filter(b => b.reference.toLowerCase() === q || (b.buyer ?? '').toLowerCase().includes(q))
  }

  /** Admits up to `count` of a booking's tickets on the device, and keeps the admission to send. */
  function admit(orderId: string, count: number): number {
    const pack = copy.data.value
    if (!pack) return 0
    const waiting = pack.tickets.filter(t => t.orderId === orderId && !t.in).slice(0, count)
    if (!waiting.length) return 0
    queue.add({ kind: 'name', ids: waiting.map(() => newScanId()), orderId, at: Date.now() })
    markIn(orderId, waiting.map(t => t.hash))
    return waiting.length
  }

  /** Online, a ticket the server let in (or found in) is marked in on the copy, so going offline later does not admit it twice. */
  async function noteIn(code: string) {
    const parts = code.trim().split('.')
    if (parts.length !== PARTS || parts[0] !== TICKET_KIND) return
    const hash = await hashOf(parts[2]!)
    const ticket = copy.data.value?.tickets.find(t => t.hash === hash)
    if (ticket && !ticket.in) markIn(ticket.orderId, [hash])
  }

  /** Online, tickets of a booking the server admitted by name, marked in on the copy. */
  function noteAdmitted(orderId: string, count: number) {
    const waiting = (copy.data.value?.tickets ?? []).filter(t => t.orderId === orderId && !t.in).slice(0, count)
    if (waiting.length) markIn(orderId, waiting.map(t => t.hash))
  }

  return { noteIn, noteAdmitted, ready: computed(() => !!copy.data.value), madeAt: copy.at, summary, check, find, admit, waiting: queue.count, sending: queue.sending, refresh: copy.refresh }
}
