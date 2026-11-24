// The till's shapes and the arithmetic it shares with the server: what a panel hands the receipt, the
// ways to pay, and a split worked out item by item exactly as server/splits.ts will work it out.

/** One line a panel hands the receipt; `more` and `fewer` draw a stepper on it. */
export interface ReceiptLine { key: string, label: string, detail?: string, quantity: number, amountMinor: number, more?: () => void, fewer?: () => void }
export interface ReceiptNote { text: string, icon?: string, action?: { label: string, run: () => void } }
/** One panel's part of the receipt. */
export interface ReceiptGroup { id: string, label: string, icon: string | null, lines: ReceiptLine[], note: ReceiptNote | null, counted: boolean }
export interface PanelAction { key: string, label: string, icon?: string, loading?: boolean, run: () => void }
/** What a panel may say about its part of the sale with the `receipt` event. */
export interface PanelReceipt {
  lines: ReceiptLine[]
  /** Something about these lines that stays on the receipt, such as the answer to an age check. */
  note?: ReceiptNote | null
  /** What the seller last added, with the way to take it back. */
  added?: { label: string, undo: () => void } | null
  /** Ways to finish without taking payment, such as reserving to pay later; never in live mode. */
  actions?: PanelAction[]
  /** These lines need an email for the receipt before they can be paid for, such as tickets. */
  needsReceipt?: boolean
}

/** A panel's lines as the server summed them. */
export interface Summary { basket: string, lines: { label: string, amountMinor: number, quantity?: number, item?: string }[], amountMinor: number }
/** A saving on the whole sale, as the server priced it. */
export interface Saving { label: string, code: string | null, amountMinor: number }
export interface Totals { panels: Summary[], savings?: Saving[], amountMinor: number }

/** Codes the customer gave and discounts the seller picked, each with its reason where one is asked for. */
export interface Pricing { codes: string[], staff: { promotionId: string, label: string, reason?: string }[] }
/** A promotion the seller may pick (payments.pricing's choices). */
export interface Choice { promotionId: string, label: string, name: string, needsReason: boolean }

export interface Offer { providerAccountId: string, provider: string, label: string, method: string, mode: 'live' | 'test', readers?: { id: string, label: string }[] }

/** One person's share of a split sale. */
export interface Share { position: number, amountMinor: number, items: { label: string, quantity: number, amountMinor: number }[], paid: boolean }
/** One of something on the receipt, as the server's summary counts them. */
export interface Unit { basket: string, line: number, label: string, amountMinor: number }
export interface PlannedShare { position: number, amountMinor: number, items: { basket: string, line: number, label: string, quantity: number, amountMinor: number }[] }

/** The amount of each of a line's `quantity` units, the first ones taking the odd pennies. */
export function unitShares(amountMinor: number, quantity: number): number[] {
  const each = Math.floor(amountMinor / quantity)
  const over = amountMinor - each * quantity
  return Array.from({ length: quantity }, (_, i) => each + (i < over ? 1 : 0))
}

/** Every unit on the receipt, a line of several giving one unit each. */
export const unitsOf = (panels: Summary[]): Unit[] => panels.flatMap(p => p.lines.flatMap((l, line) =>
  unitShares(l.amountMinor, Math.max(1, l.quantity ?? 1)).map(amountMinor => ({ basket: p.basket, line, label: l.item ?? l.label, amountMinor }))))

/** Each person's items and amount, given who owns each unit: a line's units go to people in order. */
export function planSplit(units: Unit[], owners: number[], people: number): PlannedShare[] {
  const lineOf = (u: Unit) => `${u.basket} ${u.line}`
  const byLine = new Map<string, { first: Unit, amountMinor: number, who: number[] }>()
  units.forEach((u, i) => {
    const entry = byLine.get(lineOf(u)) ?? { first: u, amountMinor: 0, who: [] }
    entry.amountMinor += u.amountMinor
    entry.who.push(owners[i] ?? 1)
    byLine.set(lineOf(u), entry)
  })
  return Array.from({ length: people }, (_, n) => n + 1).map((position) => {
    const items: PlannedShare['items'] = []
    for (const { first, amountMinor, who } of byLine.values()) {
      const lineShares = unitShares(amountMinor, who.length)
      const mine = [...who].sort((a, b) => a - b).flatMap((o, i) => (o === position ? [lineShares[i]!] : []))
      if (mine.length) items.push({ basket: first.basket, line: first.line, label: first.label, quantity: mine.length, amountMinor: mine.reduce((sum, a) => sum + a, 0) })
    }
    return { position, items, amountMinor: items.reduce((sum, i) => sum + i.amountMinor, 0) }
  })
}

// Card first: it is how nearly every sale is paid.
const RANK = ['card_reader', 'card_attested', 'card_online', 'cash']
const rank = (m: Pick<Offer, 'method'>) => (RANK.includes(m.method) ? RANK.indexOf(m.method) : RANK.length)
export const byRank = <T extends Pick<Offer, 'method'>>(methods: T[]): T[] => [...methods].sort((a, b) => rank(a) - rank(b))
const METHOD_ICONS: Record<string, string> = { card_reader: 'i-lucide-smartphone-nfc', card_attested: 'i-lucide-credit-card', card_online: 'i-lucide-credit-card', cash: 'i-lucide-banknote' }
export const methodIcon = (m: Pick<Offer, 'method'>) => METHOD_ICONS[m.method] ?? 'i-lucide-wallet'
export const methodKey = (m: Pick<Offer, 'providerAccountId' | 'method'>) => `${m.providerAccountId}:${m.method}`
/** A reader is chosen only where the provider pairs readers; the SumUp app hand-off lists none. */
export const needsReader = (m: Offer) => m.method === 'card_reader' && !!m.readers && m.readers.length !== 1

// The notes a seller is usually handed, in the major unit.
const NOTES = [5, 10, 20, 50] // not-policy: the quick amounts offered for cash
/** Quick amounts handed over for `dueMinor`: the next notes up. */
export const quickNotes = (dueMinor: number, toMinor: (major: number) => number) => NOTES.map(n => toMinor(n)).filter(n => n > dueMinor).slice(0, 3)
