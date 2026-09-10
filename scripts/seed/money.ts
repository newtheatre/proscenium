// One ledger entry for every (source, tender, kind) triple in architecture.md's money-path table,
// posted through `postEntry`, which is the ledger's only writer (0004).

import { boundFrom, holds, seedId } from './statements'
import { personIn } from './people'
import type { Bar } from './bar'
import type { Bookings } from './bookings'
import type { People } from './people'
import type { Programme } from './programme'
import type { BoundStatement, SeedTarget } from './statements'

const DAY = 86_400

// A script cannot reach `@nuxthub/db`'s binding, and `postEntry` only builds statements: it never
// awaits one, so a stand-in binding is enough to get the pair a sink runs.
async function writer(): Promise<typeof import('../../server/utils/ledger')> {
  const globals = globalThis as { __env__?: Record<string, unknown> }
  globals.__env__ = { ...globals.__env__, DB: globals.__env__?.DB ?? {} }
  return import('../../server/utils/ledger')
}

export interface Money { entries: number, paths: string[] }

export async function seedMoney(
  target: SeedTarget,
  people: People,
  programme: Programme,
  bookings: Bookings,
  bar: Bar,
  now: number,
): Promise<Money> {
  const { postEntry } = await writer()

  const deskOfficer = personIn(people, 'rowan').id
  const barKeeper = personIn(people, 'devon').id
  const manager = personIn(people, 'rowan').id
  const debtor = personIn(people, 'sam').id
  const tonight = programme.performances.get('the-seagull/tonight')!
  const lager = bar.variants.get('lager/can')!
  const gin = bar.variants.get('gin/double')!
  const wine = bar.variants.get('house-red/175')!

  const collected = bookings.reservations.get('tonight-collected')!
  const compAdmission = bookings.reservations.get('tonight-collected-two')!
  const refundable = bookings.reservations.get('tonight-refunded')!
  const walkUp = bookings.reservations.get('tonight-walkup')!
  const doorPass = bookings.reservations.get('tonight-door')!

  const statements: BoundStatement[] = []
  const paths: string[] = []
  let entries = 0

  // A guard rather than a conflict clause: `postEntry` mints its own line ids, so a re-run that
  // posted again would append a second copy of every line.
  const post = (slug: string, input: Parameters<typeof postEntry>[0], at: Date): string => {
    const id = seedId('entry', slug)
    if (holds(target, 'ledger_entries', { id })) return id
    const posted = postEntry({ ...input, id }, at)
    statements.push(...boundFrom(posted.statements))
    paths.push(slug)
    entries++
    return id
  }

  // Desk collection: the reader is paid at collection, never at reservation (D-114). The trigger
  // refuses a line whose ticket is not on a collected reservation.
  post('desk-collection', {
    source: 'DESK',
    tender: 'CARD',
    actorId: deskOfficer,
    lines: collected.tickets.map(ticket => ({
      kind: 'TICKET_COLLECTION' as const,
      amountPence: ticket.price,
      qty: 1,
      unitPricePence: ticket.price,
      reservationId: collected.id,
      performanceId: tonight.id,
      ticketId: ticket.id,
      priceRef: 'BASE',
    })),
  }, new Date((now - 3 * 3600) * 1000))

  // Comp admission: zero taken, the full price kept on the line so foregone value is a figure
  // rather than an absence (I-103).
  post('comp-admission', {
    source: 'DESK',
    tender: 'COMP',
    actorId: deskOfficer,
    compReason: 'Reviewer from Impact, arranged with the publicity officer.',
    compApprovedBy: manager,
    lines: compAdmission.tickets.map(ticket => ({
      kind: 'TICKET_COLLECTION' as const,
      amountPence: 0,
      qty: 1,
      unitPricePence: ticket.price,
      reservationId: compAdmission.id,
      performanceId: tonight.id,
      ticketId: ticket.id,
      priceRef: 'BASE',
    })),
  }, new Date((now - 3 * 3600 + 300) * 1000))

  // Walk-up: reservation and payment in one desk flow (D-115), on the card and as a comp.
  post('walk-up-card', {
    source: 'DESK',
    tender: 'CARD',
    actorId: deskOfficer,
    lines: walkUp.tickets.map(ticket => ({
      kind: 'WALK_UP' as const,
      amountPence: ticket.price,
      qty: 1,
      unitPricePence: ticket.price,
      reservationId: walkUp.id,
      performanceId: tonight.id,
      ticketId: ticket.id,
    })),
  }, new Date((now - 2 * 3600) * 1000))

  post('walk-up-comp', {
    source: 'DESK',
    tender: 'COMP',
    actorId: deskOfficer,
    compReason: 'A seat for the sign language interpreter.',
    compApprovedBy: manager,
    lines: [{
      kind: 'WALK_UP' as const,
      amountPence: 0,
      qty: 1,
      unitPricePence: 700,
      performanceId: tonight.id,
    }],
  }, new Date((now - 2 * 3600 + 120) * 1000))

  // A correction is a new entry naming what it corrects, with negative amounts (0010, D-116).
  const paid = post('paid-for-refund', {
    source: 'DESK',
    tender: 'CARD',
    actorId: deskOfficer,
    lines: refundable.tickets.map(ticket => ({
      kind: 'TICKET_COLLECTION' as const,
      amountPence: ticket.price,
      qty: 1,
      unitPricePence: ticket.price,
      reservationId: refundable.id,
      performanceId: tonight.id,
      ticketId: ticket.id,
    })),
  }, new Date((now - 5 * 3600) * 1000))

  post('refund', {
    source: 'DESK',
    tender: 'CARD',
    actorId: deskOfficer,
    reversesEntryId: paid,
    lines: [{
      kind: 'REFUND' as const,
      amountPence: -700,
      qty: 1,
      unitPricePence: 700,
      reservationId: refundable.id,
      performanceId: tonight.id,
      ticketId: refundable.tickets[0]!.id,
    }],
  }, new Date((now - 2 * 3600) * 1000))

  post('pass-sale', {
    source: 'DESK',
    tender: 'CARD',
    actorId: deskOfficer,
    lines: [{ kind: 'PASS_SALE' as const, amountPence: 3500, qty: 1, unitPricePence: 3500, priceRef: 'season-2026-27/Standard' }],
  }, new Date((now - 20 * DAY) * 1000))

  // Money that did not move, and still a fact: the value is the pass sale that already posted.
  post('pass-admission-online', {
    source: 'SELF_SERVE',
    tender: 'NONE',
    actorId: null,
    lines: [{ kind: 'PASS_ADMISSION' as const, amountPence: 0, qty: 1, unitPricePence: 0, performanceId: tonight.id }],
  }, new Date((now - 6 * DAY) * 1000))

  post('pass-admission-door', {
    source: 'DESK',
    tender: 'NONE',
    actorId: deskOfficer,
    lines: [{
      kind: 'PASS_ADMISSION' as const,
      amountPence: 0,
      qty: 1,
      unitPricePence: 0,
      reservationId: doorPass.id,
      performanceId: tonight.id,
      ticketId: doorPass.tickets[0]!.id,
    }],
  }, new Date((now - 3600) * 1000))

  // The bar, on the card, with a discount netted into the amount and snapshotted beside it (F-117).
  post('bar-card', {
    source: 'TILL',
    tender: 'CARD',
    actorId: barKeeper,
    lines: [
      { kind: 'BAR_ITEM' as const, amountPence: lager.price * 2, qty: 2, unitPricePence: lager.price, productVariantId: lager.id },
      { kind: 'BAR_ITEM' as const, amountPence: wine.price, qty: 1, unitPricePence: wine.price, productVariantId: wine.id },
    ],
  }, new Date((now - 90 * 60) * 1000))

  post('bar-card-discounted', {
    source: 'TILL',
    tender: 'CARD',
    actorId: barKeeper,
    lines: [{
      kind: 'BAR_ITEM' as const,
      amountPence: Math.round(gin.price * 0.8),
      qty: 1,
      unitPricePence: gin.price,
      productVariantId: gin.id,
      discountId: seedId('discount', 'cast-and-crew'),
      discountPercent: 20,
      discountPence: gin.price - Math.round(gin.price * 0.8),
      choices: { Mixers: 'Tonic water' },
    }],
  }, new Date((now - 80 * 60) * 1000))

  // Zero taken, retail price kept, so what was given away is queryable (F-110).
  post('bar-comp', {
    source: 'TILL',
    tender: 'COMP',
    actorId: barKeeper,
    compReason: 'Replacing a drink knocked over by a member of the door team.',
    compApprovedBy: manager,
    lines: [{ kind: 'BAR_ITEM' as const, amountPence: 0, qty: 2, unitPricePence: lager.price, productVariantId: lager.id }],
  }, new Date((now - 70 * 60) * 1000))

  // Credit extended rather than money taken: the entry stamps the debtor and stays outstanding
  // until a settlement covers it (F-108).
  const tabOne = post('tab-charge', {
    source: 'TILL',
    tender: 'TAB',
    actorId: barKeeper,
    tabDebtorId: debtor,
    lines: [{ kind: 'BAR_ITEM' as const, amountPence: wine.price * 4, qty: 4, unitPricePence: wine.price, productVariantId: wine.id }],
  }, new Date((now - 8 * DAY) * 1000))

  const tabTwo = post('tab-charge-two', {
    source: 'TILL',
    tender: 'TAB',
    actorId: barKeeper,
    tabDebtorId: debtor,
    lines: [{ kind: 'BAR_ITEM' as const, amountPence: lager.price * 6, qty: 6, unitPricePence: lager.price, productVariantId: lager.id }],
  }, new Date((now - 7 * DAY) * 1000))

  // Settled on the reader, one line per charge it covers, on its own calendar day. A charge can
  // be settled once, which a unique index on `settles_entry_id` enforces (F-109).
  post('tab-settlement', {
    source: 'TILL',
    tender: 'CARD',
    actorId: barKeeper,
    lines: [
      { kind: 'TAB_SETTLEMENT' as const, amountPence: wine.price * 4, qty: 1, settlesEntryId: tabOne },
      { kind: 'TAB_SETTLEMENT' as const, amountPence: lager.price * 6, qty: 1, settlesEntryId: tabTwo },
    ],
  }, new Date((now - 2 * DAY) * 1000))

  // A void is a correction of an unsettled charge, naming it and carrying its reason on the
  // record rather than in the audit trail (F-109 criterion 4, 0011).
  const tabThree = post('tab-charge-voided', {
    source: 'TILL',
    tender: 'TAB',
    actorId: barKeeper,
    tabDebtorId: personIn(people, 'iris').id,
    lines: [{ kind: 'BAR_ITEM' as const, amountPence: gin.price, qty: 1, unitPricePence: gin.price, productVariantId: gin.id }],
  }, new Date((now - 4 * DAY) * 1000))

  post('tab-void', {
    source: 'TILL',
    tender: 'TAB',
    actorId: barKeeper,
    reversesEntryId: tabThree,
    voidOfEntryId: tabThree,
    voidReason: 'Charged to the wrong tab: the round was the production\'s, not the holder\'s.',
    tabDebtorId: personIn(people, 'iris').id,
    lines: [{ kind: 'BAR_ITEM' as const, amountPence: -gin.price, qty: 1, unitPricePence: gin.price, productVariantId: gin.id }],
  }, new Date((now - 3 * DAY) * 1000))

  // Six years of the old estate load as opening history, in closed periods, keeping their own
  // calendar day (I-109, K-114). Two rows stand in for it: one tendered, one recorded as neither.
  post('import-card', {
    source: 'IMPORT',
    tender: 'CARD',
    actorId: null,
    lines: [{ kind: 'IMPORT' as const, amountPence: 128_400, qty: 1, priceRef: '2024/25 season, box office total' }],
  }, new Date((now - 500 * DAY) * 1000))

  post('import-none', {
    source: 'IMPORT',
    tender: 'NONE',
    actorId: null,
    lines: [{ kind: 'IMPORT' as const, amountPence: 4200, qty: 1, priceRef: '2024/25 season, comps recorded without a tender' }],
  }, new Date((now - 500 * DAY) * 1000))

  if (statements.length) target.batch(statements)

  return { entries, paths }
}
