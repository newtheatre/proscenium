import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { PRODUCT_COLUMNS, choiceGroupOptionsQuery, componentsQuery, resolvedPriceColumns } from '#server/utils/bar'
import { ageCheckConstraintRefusal } from '#shared/utils/age-checks'
import { discountedPence } from '#shared/utils/discounts'
import { postEntry, runLedgerBatch } from '#server/utils/ledger'
import { isDutyOrBarManager } from '#server/utils/bar-authority'
import { authorisedTabHolder, outstandingTabBalance } from '#server/utils/tab-holders'
import { tabCapGuard } from '#server/utils/tab-settlement'
import { claimCompRequestForSale, compRequestById, compRequestLines, releaseCompRequestClaim } from '#server/utils/comps'
import { priceRef, saysMoney } from '#shared/utils/bar'
import { deskTicketsQuery } from '#server/utils/desk'
import { tillBookingById } from '#server/utils/till-bookings'
import { bookableTicketTypes, guestAccount, writeReservation } from '#server/utils/reservations'
import { performanceById } from '#server/utils/programme'
import { effectiveCapacity } from '#server/utils/performances'
import { qrTokenFor } from '#server/utils/qr-tokens'
import { qrSvgBase64 } from '#server/utils/qr'
import { sendWalkUpPaid } from '#server/utils/reservation-confirmation'
import { barWindowsTonight, shiftOffsetDefaults } from '#server/utils/rota'
import { houseForSale } from '#shared/utils/rota-times'
import { saleRefusal } from '#shared/utils/programme'
import { holdExpiresAt, resolveHoldReleaseMinutes } from '#shared/utils/reservations'
import type { InlineAgeCheckInput } from '#shared/utils/age-checks'
import type { Discount } from '#shared/utils/discounts'
import type { DeskTicketLine } from '#server/utils/desk'
import type { ReservationLineToWrite } from '#server/utils/reservations'
import type { BasketLineInput, CollectedTicketLine, PricedBasket, PricedLine, SaleCatalogue, SaleCategory, SaleChoice, SaleInput, SaleProduct, SaleReceipt, SaleVariant, TicketLineInput, WalkUpGuestInput, WalkUpLineInput, WalkUpReceipt } from '#shared/utils/sale'
import type { AuditRow } from '#shared/utils/audit'
import type { EntryInput } from '#shared/utils/ledger'
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { H3Event } from 'h3'

// What the till may sell right now, what pricing it costs, and the atomic commit once confirmed:
// a reader, a tab or an approved comp, a Challenge 25 outcome and a discount, folded in as needed.

type PublicDiscount = Pick<Discount, 'id' | 'name' | 'percent'>

// A discount the basket named, resolved once and reused by both the price check and the commit,
// so neither can disagree about what it takes off (F-104 criterion 1, F-117 criterion 4).
async function resolveDiscount(discountId: string | null): Promise<Discount | null> {
  if (!discountId) return null
  const discount = await discountById(discountId)
  if (!discount) throw createError({ statusCode: 404, statusMessage: 'No such discount' })
  if (discount.status !== 'ACTIVE') {
    throw createError({ statusCode: 409, statusMessage: `${discount.name} is retired, so it cannot be applied to a new sale` })
  }
  return discount
}

interface VariantRow {
  id: string
  productId: string
  servingKind: string
  label: string
  ageRestricted: number
  pricePence: number | null
  priceSource: 'variant' | 'category' | null
  priceRowId: string | null
}

interface ComponentRow {
  variantId: string
  itemId: string | null
  choiceGroupId: string | null
  choiceGroupName: string | null
  qty: number
}

interface OptionRow {
  choiceGroupId: string
  id: string
  itemId: string
  itemName: string
  qty: number
}

// One resolved ingredient a sale line depletes: an item and how much of it, in the item's own
// counting unit, before the line's own quantity is applied (F-113, F-105 criterion 1).
export interface Depletion {
  itemId: string
  qty: number
}

// The public `SaleVariant` shape plus what only the write path reads: F-121's `price_ref`,
// F-113's recipe, F-106's `ageRestricted` gate (the owning product's flag, not this size's own).
interface ResolvedVariant extends SaleVariant {
  productId: string
  priceRowId: string
  ageRestricted: boolean
  recipe: Depletion[]
}

export interface Resolvable {
  variants: Map<string, ResolvedVariant>
  // Keyed by the option row's id, not the item: two options in different groups could share a
  // stocked item, and it is the option chosen that says how much of it a line depletes.
  optionById: Map<string, OptionRow>
}

// The catalogue read every screen and every price check shares, so none of them can disagree
// about what is sellable (F-103 criterion 3); exported so several baskets can share one resolve.
export async function activeVariantsWithChoices(on: string): Promise<Resolvable> {
  const { pricePence, priceSource, priceRowId } = resolvedPriceColumns(sql`p.category_id`, 'v', on)
  const variantRows = await db.all<VariantRow>(sql`
    SELECT v.id AS id, v.product_id AS productId, v.serving_kind AS servingKind, v.label AS label,
           p.age_restricted AS ageRestricted,
           ${pricePence} AS pricePence, ${priceSource} AS priceSource, ${priceRowId} AS priceRowId
    FROM product_variants v JOIN bar_products p ON p.id = v.product_id
    WHERE v.status = 'ACTIVE' AND p.status = 'ACTIVE'
    ORDER BY v.sort, v.label COLLATE NOCASE
  `)
  // Unpriced is unsellable, not a broken button: excluded here rather than drawn disabled (0017).
  const priced = variantRows.filter((row): row is VariantRow & { pricePence: number, priceSource: 'variant' | 'category', priceRowId: string } =>
    row.pricePence !== null && row.priceSource !== null && row.priceRowId !== null)

  const components = await db.all<ComponentRow>(componentsQuery(sql`SELECT id FROM product_variants WHERE status = 'ACTIVE'`))
  const options = await db.all<OptionRow>(choiceGroupOptionsQuery(sql`
    SELECT DISTINCT choice_group_id FROM variant_components WHERE choice_group_id IS NOT NULL
  `))
  const groupNames = await db.all<{ id: string, name: string }>(sql`SELECT id, name FROM choice_groups`)
  const nameOf = new Map(groupNames.map(group => [group.id, group.name]))

  const choiceOf = new Map<string, SaleChoice>()
  const recipeOf = new Map<string, Depletion[]>()
  for (const component of components) {
    if (component.itemId) {
      const recipe = recipeOf.get(component.variantId) ?? []
      recipe.push({ itemId: component.itemId, qty: component.qty })
      recipeOf.set(component.variantId, recipe)
      continue
    }
    if (!component.choiceGroupId || choiceOf.has(component.variantId)) continue
    choiceOf.set(component.variantId, {
      id: component.choiceGroupId,
      name: nameOf.get(component.choiceGroupId) ?? '',
      options: options
        .filter(option => option.choiceGroupId === component.choiceGroupId)
        .map(option => ({ id: option.id, itemName: option.itemName })),
    })
  }
  const optionById = new Map(options.map(option => [option.id, option]))

  const variants = new Map(priced.map((row) => {
    const choice = choiceOf.get(row.id) ?? null
    return [row.id, {
      id: row.id,
      productId: row.productId,
      servingKind: row.servingKind as SaleVariant['servingKind'],
      label: row.label,
      pricePence: row.pricePence,
      priceSource: row.priceSource,
      priceRowId: row.priceRowId,
      ageRestricted: row.ageRestricted === 1,
      choice,
      recipe: recipeOf.get(row.id) ?? [],
    }]
  }))

  return { variants, optionById }
}

// One tile per sellable product; a product left with no priced size (the pre-F-112 activation
// gap, known-issues.md) simply has none to draw, rather than a size button with nothing behind it.
export async function sellableCatalogue(on: string): Promise<SaleCatalogue> {
  const categories = await db.all<SaleCategory>(sql`
    SELECT id AS id, name AS name, sort AS sort, colour AS colour FROM bar_categories
    ORDER BY sort, name COLLATE NOCASE
  `)

  interface ProductRow { id: string, name: string, categoryId: string, ageRestricted: number, allergenState: SaleProduct['allergenState'], allergenNote: string | null }
  const productRows = await db.all<ProductRow>(sql`
    SELECT ${PRODUCT_COLUMNS} FROM bar_products p JOIN bar_categories c ON c.id = p.category_id
    WHERE p.status = 'ACTIVE'
    ORDER BY c.sort, c.name COLLATE NOCASE, p.sort, p.name COLLATE NOCASE
  `)

  const variants = [...(await activeVariantsWithChoices(on)).variants.values()]
  const products: SaleProduct[] = productRows
    .map(row => ({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      ageRestricted: row.ageRestricted === 1,
      allergenState: row.allergenState,
      allergenNote: row.allergenNote,
      variants: variants.filter(variant => variant.productId === row.id)
        // Only what the screen needs: the write-path fields (price row, recipe, the product's own
        // age-restricted flag, already carried on the product itself) stay internal.
        .map(({ productId: _productId, priceRowId: _priceRowId, ageRestricted: _ageRestricted, recipe: _recipe, ...variant }) => variant),
    }))
    .filter(product => product.variants.length > 0)

  return { on, categories, products }
}

interface ResolvedLine {
  variant: ResolvedVariant
  qty: number
  choiceItemId: string | null
  choiceItemName: string | null
  depletion: Depletion[]
  amountPence: number
}

// One basket line checked against what the till may actually sell (variant active and priced,
// choice required and valid); the chosen option depletes at its own quantity (F-113 criterion 2).
function resolveLines(lines: BasketLineInput[], { variants, optionById }: Resolvable): ResolvedLine[] {
  return lines.map((line) => {
    const variant = variants.get(line.variantId)
    if (!variant) {
      throw createError({ statusCode: 422, statusMessage: 'That size is not on the till right now' })
    }

    let choiceItemId: string | null = null
    let choiceItemName: string | null = null
    const depletion = [...variant.recipe]
    if (variant.choice) {
      const chosen = variant.choice.options.find(option => option.id === line.choiceItemId)
      const option = chosen ? optionById.get(chosen.id) : undefined
      if (!chosen || !option) {
        throw createError({ statusCode: 422, statusMessage: `${variant.label} needs a ${variant.choice.name.toLowerCase()} chosen before it can be sold` })
      }
      choiceItemId = chosen.id
      choiceItemName = chosen.itemName
      depletion.push({ itemId: option.itemId, qty: option.qty })
    }
    else if (line.choiceItemId) {
      throw createError({ statusCode: 422, statusMessage: `${variant.label} takes no choice` })
    }

    return { variant, qty: line.qty, choiceItemId, choiceItemName, depletion, amountPence: variant.pricePence * line.qty }
  })
}

// The one resolution both pricing and committing build from, called once rather than twice, so
// no price change can land between a check and its write (F-103 criterion 3, F-104 criterion 1).
async function resolveSale(
  lines: BasketLineInput[],
  on: string,
  discountId: string | null,
  catalogue?: Resolvable,
): Promise<{ resolved: ResolvedLine[], priced: PricedLine[], totalPence: number, discount: Discount | null }> {
  const resolved = resolveLines(lines, catalogue ?? await activeVariantsWithChoices(on))
  const discount = await resolveDiscount(discountId)

  // Scoped to the basket's own lines, bounded by MAX_BASKET_LINES, never to the whole catalogue
  // (0003): a basket of two should not bind a parameter per product the till has ever priced.
  interface ProductName { id: string, name: string }
  const productIds = [...new Set(resolved.map(line => line.variant.productId))]
  const productNames = productIds.length === 0
    ? []
    : await db.all<ProductName>(sql`SELECT id AS id, name AS name FROM bar_products WHERE id IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`)
  const nameOfProduct = new Map(productNames.map(product => [product.id, product.name]))

  const priced: PricedLine[] = resolved.map(line => ({
    variantId: line.variant.id,
    productName: nameOfProduct.get(line.variant.productId) ?? '',
    variantLabel: line.variant.label,
    choiceItemName: line.choiceItemName,
    qty: line.qty,
    unitPricePence: line.variant.pricePence,
    priceSource: line.variant.priceSource,
    amountPence: line.amountPence,
    discountPence: discount ? discountedPence(line.amountPence, discount.percent) : 0,
  }))

  const totalPence = priced.reduce((sum, line) => sum + line.amountPence - line.discountPence, 0)
  return { resolved, priced, totalPence, discount }
}

function publicDiscount(discount: Discount | null): PublicDiscount | null {
  return discount ? { id: discount.id, name: discount.name, percent: discount.percent } : null
}

// Recomputes a submitted basket against live, effective prices: never the client's own arithmetic
// (0004). A line naming a variant this cannot sell right now is refused by name (F-103 criterion 3).
export async function priceBasket(lines: BasketLineInput[], on: string, discountId: string | null): Promise<PricedBasket> {
  const { priced, totalPence, discount } = await resolveSale(lines, on, discountId)
  return { lines: priced, totalPence, discount: publicDiscount(discount) }
}

// Prices a basket against a catalogue resolved elsewhere: one resolve for several baskets, not
// one per basket, the same shape the comp queue needs (0003). `on` goes unused once given.
export async function priceBasketAgainst(lines: BasketLineInput[], catalogue: Resolvable, discountId: string | null): Promise<PricedBasket> {
  const { priced, totalPence, discount } = await resolveSale(lines, '', discountId, catalogue)
  return { lines: priced, totalPence, discount: publicDiscount(discount) }
}

// Everything `commitSale` knows beyond the basket: what its audit rows cite, which performance
// an age check attaches to (F-106), and which night a tab override is checked against (F-108).
export interface SaleContext {
  actorId: string
  sessionId: string
  venueId: string
  night: string
  performanceId: string | null
  // Tonight's houses at this venue: what a walk-up may be sold for, and what "tonight" means
  // when a found booking is flagged as another night's (F-122, F-123).
  performanceIds?: string[]
  // Where the door pass and the walk-up's email point (D-108); absent means no pass is minted.
  baseURL?: string
  // Present on a live request, so a walk-up's confirmation goes out through the real transport.
  event?: H3Event
}

// The two things a basket may carry beyond drinks (F-122, F-123). Absent means a bar-only sale,
// which is every caller before those stories.
export interface SaleExtras {
  tickets: TicketLineInput[]
  walkUps: WalkUpLineInput[]
  walkUpGuest: WalkUpGuestInput | null
}

const NO_EXTRAS: SaleExtras = { tickets: [], walkUps: [], walkUpGuest: null }

interface ResolvedTicketBooking {
  id: string
  reference: string
  performanceId: string
  tickets: DeskTicketLine[]
  owedPence: number
}

// Each booking read fresh, refused by its own status in the desk's words, and priced from what
// its tickets snapshotted (F-122 criterion 2). Nothing here edits a booking.
async function resolveTickets(tickets: TicketLineInput[], performanceIds: string[]): Promise<ResolvedTicketBooking[]> {
  const bookings: ResolvedTicketBooking[] = []
  for (const line of tickets) {
    const booking = await tillBookingById(line.reservationId, performanceIds)
    if (!booking) throw createError({ statusCode: 404, statusMessage: 'That booking no longer exists' })
    if (booking.refusal) throw createError({ statusCode: 409, statusMessage: `${booking.reference}: ${booking.refusal}` })
    const rows = await db.all<DeskTicketLine>(deskTicketsQuery(booking.id))
    bookings.push({
      id: booking.id,
      reference: booking.reference,
      performanceId: booking.performanceId,
      tickets: rows,
      owedPence: rows.reduce((sum, ticket) => sum + ticket.pricePaid, 0),
    })
  }
  return bookings
}

interface ResolvedWalkUp {
  performanceId: string
  showTitle: string
  startsAt: number
  lines: ReservationLineToWrite[]
  capacity: number | null
  windowBypassed: boolean
  holdExpiresAt: number
  amountPence: number
  partySize: number
}

// A walk-up is priced the way the desk prices one (D-115): tonight's houses at this venue only,
// the desk's window bypass, no access types, and every refusal the programme would give.
async function resolveWalkUps(walkUps: WalkUpLineInput[], performanceIds: string[], at: Date): Promise<ResolvedWalkUp[]> {
  const byPerformance = new Map<string, WalkUpLineInput[]>()
  for (const line of walkUps) {
    byPerformance.set(line.performanceId, [...(byPerformance.get(line.performanceId) ?? []), line])
  }

  const resolved: ResolvedWalkUp[] = []
  for (const [performanceId, lines] of byPerformance) {
    if (!performanceIds.includes(performanceId)) {
      throw createError({ statusCode: 409, statusMessage: 'The till sells walk-ups for tonight at this venue only; advance sales are on the desk' })
    }
    const performance = await performanceById(performanceId)
    if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
    const refusal = saleRefusal(performance, at, 'DESK')
    if (refusal) throw createError({ statusCode: 409, statusMessage: refusal.says })

    const types = new Map((await bookableTicketTypes(performanceId, performance.showId, false, false))
      .filter(type => type.accessKind === null)
      .map(type => [type.id, type]))
    const priced = lines.map((line) => {
      const type = types.get(line.ticketTypeId)
      if (!type) throw createError({ statusCode: 400, statusMessage: 'No such ticket type for this performance' })
      return { ticketTypeId: type.id, quantity: line.quantity, pricePaid: type.price, priceSource: type.source }
    })

    const releaseMinutes = resolveHoldReleaseMinutes(performance.holdReleaseMinutesBefore, await configValue(undefined, 'HOLD_RELEASE_MINUTES_BEFORE'))
    resolved.push({
      performanceId,
      showTitle: performance.showTitle,
      startsAt: performance.startsAt,
      lines: priced,
      capacity: effectiveCapacity(performance),
      windowBypassed: saleRefusal(performance, at, 'CUSTOMER')?.reason === 'WINDOW_CLOSED',
      holdExpiresAt: holdExpiresAt(performance.startsAt, releaseMinutes),
      amountPence: priced.reduce((sum, line) => sum + line.pricePaid * line.quantity, 0),
      partySize: priced.reduce((sum, line) => sum + line.quantity, 0),
    })
  }
  return resolved
}

// The booking's move to COLLECTED rides the same batch as the money (D-114 criterion 6); the
// predicate on the statement is what refuses a booking somebody else collected first.
function collectionStatements(reservationId: string, actorId: string, totalPence: number): BatchItem<'sqlite'>[] {
  return [
    db.run(sql`
      UPDATE reservations SET status = 'COLLECTED', hold_expires_at = NULL, updated_at = unixepoch()
      WHERE id = ${reservationId} AND status = 'PENDING'
    `),
    db.insert(schema.auditLog).values(auditEntry({
      actorId,
      action: 'reservation.collected',
      target: `reservation:${reservationId}`,
      detail: { tender: 'CARD', totalPence, at: 'till' },
    })),
  ]
}

// A refused Challenge 25 outcome drops every restricted line rather than the whole basket: what
// is left may still be sold, at its own, smaller total (F-106 criterion 3).
function saleableAfterAgeCheck(
  resolved: ResolvedLine[],
  priced: PricedLine[],
  ageCheck: InlineAgeCheckInput | null,
): { restricted: number[], sold: number[] } {
  const restricted = resolved.map((line, index) => (line.variant.ageRestricted ? index : -1)).filter(index => index !== -1)
  const refused = restricted.length > 0 && ageCheck?.outcome === 'REFUSED'
  const sold = refused ? resolved.map((_, index) => index).filter(index => !restricted.includes(index)) : resolved.map((_, index) => index)
  return { restricted, sold }
}

// Whether a guarded entry actually landed. Read back rather than inferred, the same way a
// contended claim always answers for itself (0001, 0003).
async function entryExists(id: string): Promise<boolean> {
  const [row] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM ledger_entries WHERE id = ${id}`)
  return Number(row?.n ?? 0) === 1
}

// The tab side of the cross-check (F-108 criteria 1, 3, 4): resolved once, so the balance read
// and the write it gates can never see two different figures.
async function resolveTab(
  tabHolderId: string | null,
  actorId: string,
  night: string,
  chargePence: number,
): Promise<{ holderId: string, holderName: string, outstandingPence: number, capOverridden: boolean, guard: SQL | null } | null> {
  if (!tabHolderId) return null

  const holder = await authorisedTabHolder(undefined, tabHolderId)
  if (!holder) throw createError({ statusCode: 409, statusMessage: 'That member is not authorised to charge to a tab' })

  const cap = await configValue(undefined, 'BAR_TAB_CAP_PENCE')
  const outstandingPence = await outstandingTabBalance(tabHolderId)
  let capOverridden = false

  if (outstandingPence + chargePence > cap) {
    const overrideEnabled = await configValue(undefined, 'BAR_TAB_CAP_MANAGER_OVERRIDE')
    if (!overrideEnabled || !await isDutyOrBarManager(actorId, night)) {
      throw createError({
        statusCode: 409,
        statusMessage: `${holder.name}'s tab is at ${saysMoney(outstandingPence)}; this charge of ${saysMoney(chargePence)} `
          + `would take it past the ${saysMoney(cap)} cap. Nothing has been charged: a duty manager or bar manager can override.`,
      })
    }
    capOverridden = true
  }

  // The refusal above is for the reader; this is what actually holds the cap. An overridden
  // charge carries no guard: a manager waved this one past deliberately (criterion 4).
  const guard = capOverridden ? null : tabCapGuard(holder.id, chargePence, cap)
  return { holderId: holder.id, holderName: holder.name, outstandingPence, capOverridden, guard }
}

// The cross-check (F-104) and the one atomic write (F-105 criterion 1): the ledger entry, its
// lines and stock, a Challenge 25 outcome and a tab charge when the basket needs them, and audit.
interface PreparedSale {
  // Which house this basket belongs to, resolved once and used by every row the commit writes.
  performanceId: string | null
  resolved: ResolvedLine[]
  priced: PricedLine[]
  discount: Discount | null
  restricted: number[]
  soldResolved: ResolvedLine[]
  soldPriced: PricedLine[]
  refusedPriced: PricedLine[]
  bookings: ResolvedTicketBooking[]
  walkUps: ResolvedWalkUp[]
  ticketsPence: number
  walkUpsPence: number
  soldTotalPence: number
}

// What resolving a house needs: a comp request is asked for before there is a session to name.
export interface HouseScope {
  venueId: string
  night: string
  performanceId: string | null
  performanceIds?: string[]
  event?: H3Event
}

// Which house a bar sale belongs to on a night running more than one: the window containing the
// sale, else the nearest, with a tie to the earlier; no window resolves nothing (F-126).
export async function performanceForSale(context: HouseScope, at: number): Promise<string | null> {
  // A caller naming a performance was already narrowed to it by the guard.
  if (context.performanceId) return context.performanceId
  const covered = context.performanceIds ?? []
  if (covered.length <= 1) return covered[0] ?? null

  const windows = await barWindowsTonight(context.venueId, context.night, await shiftOffsetDefaults(context.event))
  return houseForSale(covered, windows, at)
}

// What the cross-check answers a hand-off with: the figure it agreed, and the house it resolved,
// so the hand-off pins one rather than resolving it a second time (F-124 criterion 2, F-126).
export interface PricedAttempt { soldTotalPence: number, performanceId: string | null }

// Everything the commit checks before it writes, so a SumUp hand-off can run the identical
// cross-check at the start and again at the answer (F-104, F-124 criteria 2 and 4).
async function prepareSale(
  lines: BasketLineInput[],
  on: string,
  expectedTotalPence: number,
  ageCheck: InlineAgeCheckInput | null,
  discountId: string | null,
  context: SaleContext,
  extras: SaleExtras,
): Promise<PreparedSale> {
  const { resolved, priced, discount } = lines.length > 0
    ? await resolveSale(lines, on, discountId)
    : { resolved: [], priced: [], discount: await resolveDiscount(discountId) }
  const { restricted, sold } = saleableAfterAgeCheck(resolved, priced, ageCheck)

  // Ticket money is read against the database as it stands now, never from what the screen
  // showed, so a booking collected at the desk meanwhile refuses here (F-122, F-124 criterion 4).
  const performanceIds = context.performanceIds ?? (context.performanceId ? [context.performanceId] : [])
  const bookings = await resolveTickets(extras.tickets, performanceIds)
  const walkUps = await resolveWalkUps(extras.walkUps, performanceIds, new Date())
  const ticketsPence = bookings.reduce((sum, booking) => sum + booking.owedPence, 0)
  const walkUpsPence = walkUps.reduce((sum, walkUp) => sum + walkUp.amountPence, 0)

  // No route sells a restricted line without an outcome on record first (F-106 criteria 1, 5).
  if (restricted.length > 0 && !ageCheck) {
    const names = [...new Set(restricted.map(index => priced[index]!.productName))]
    throw createError({
      statusCode: 409,
      statusMessage: `${names.join(' and ')} ${names.length === 1 ? 'needs' : 'need'} a Challenge 25 outcome before this can be charged`,
    })
  }

  const soldResolved = sold.map(index => resolved[index]!)
  const soldPriced = sold.map(index => priced[index]!)
  const refusedPriced = restricted.filter(index => !sold.includes(index)).map(index => priced[index]!)
  const barPence = soldPriced.reduce((sum, line) => sum + line.amountPence - line.discountPence, 0)
  // A discount never touches a ticket line (F-122 criterion 4): the bar subtotal is what it cut.
  const soldTotalPence = barPence + ticketsPence + walkUpsPence

  if (soldTotalPence !== expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysMoney(expectedTotalPence)}; the till now reads ${saysMoney(soldTotalPence)}. Nothing has been charged: check the basket and try again.`,
    })
  }

  return {
    performanceId: await performanceForSale(context, Math.floor(Date.now() / 1000)),
    resolved, priced, discount, restricted, soldResolved, soldPriced, refusedPriced,
    bookings, walkUps, ticketsPence, walkUpsPence, soldTotalPence,
  }
}

// The cross-check alone, for a basket about to be handed to the SumUp app (F-124 criterion 2):
// refused here means the app is never opened for it.
export async function priceSaleForAttempt(input: SaleInput, on: string, context: SaleContext): Promise<PricedAttempt> {
  const prepared = await prepareSale(input.lines, on, input.expectedTotalPence, input.ageCheck, input.discountId, context,
    { tickets: input.tickets, walkUps: input.walkUps, walkUpGuest: input.walkUpGuest })
  return { soldTotalPence: prepared.soldTotalPence, performanceId: prepared.performanceId }
}

export async function commitSale(
  lines: BasketLineInput[],
  on: string,
  expectedTotalPence: number,
  ageCheck: InlineAgeCheckInput | null,
  discountId: string | null,
  tabHolderId: string | null,
  context: SaleContext,
  extras: SaleExtras = NO_EXTRAS,
): Promise<SaleReceipt> {
  const { performanceId, priced, discount, restricted, soldResolved, soldPriced, refusedPriced, bookings, walkUps, soldTotalPence }
    = await prepareSale(lines, on, expectedTotalPence, ageCheck, discountId, context, extras)

  // Only relevant when there is something to charge: a full age-check refusal leaves nothing for
  // any tender to apply to. The form already refused a tab over any ticket line (criterion 5).
  const tab = soldResolved.length > 0 ? await resolveTab(tabHolderId, context.actorId, context.night, soldTotalPence) : null

  // A walk-up's reservation is its own write first, exactly as the desk's is (D-115, 0001): the
  // capacity predicate on its tickets decides, and a refused house refuses the whole basket.
  const booker = extras.walkUpGuest ? await guestAccount(extras.walkUpGuest.email, extras.walkUpGuest.name) : null
  const written: Array<ResolvedWalkUp & { reservationId: string, reference: string, tickets: { id: string, pricePaid: number }[] }> = []
  for (const walkUp of walkUps) {
    const result = await writeReservation({
      performanceId: walkUp.performanceId,
      userId: booker?.id ?? null,
      source: 'DOOR',
      windowBypassed: walkUp.windowBypassed,
      lines: walkUp.lines,
      capacity: walkUp.capacity,
      holdExpiresAt: walkUp.holdExpiresAt,
    })
    if (result.tickets.length < result.requested) {
      throw createError({ statusCode: 409, statusMessage: `${walkUp.showTitle} no longer has room for that order. Nothing has been charged.` })
    }
    written.push({ ...walkUp, reservationId: result.id, reference: result.reference, tickets: result.tickets })
  }

  const statements: BatchItem<'sqlite'>[] = []
  let entryId: string | null = null

  // Collections precede the lines that cite them: the ledger's trigger refuses a ticket line
  // whose booking is not COLLECTED (0001, D-114 criterion 6).
  for (const booking of bookings) statements.push(...collectionStatements(booking.id, context.actorId, booking.owedPence))
  for (const walkUp of written) statements.push(...collectionStatements(walkUp.reservationId, context.actorId, walkUp.amountPence))

  const ticketLines: EntryInput['lines'] = [
    ...bookings.flatMap(booking => booking.tickets.map(ticket => ({
      kind: 'TICKET_COLLECTION' as const,
      amountPence: ticket.pricePaid,
      qty: 1,
      unitPricePence: ticket.pricePaid,
      reservationId: booking.id,
      ticketId: ticket.ticketId,
      performanceId: booking.performanceId,
    }))),
    ...written.flatMap(walkUp => walkUp.tickets.map(ticket => ({
      kind: 'WALK_UP' as const,
      amountPence: ticket.pricePaid,
      qty: 1,
      unitPricePence: ticket.pricePaid,
      reservationId: walkUp.reservationId,
      ticketId: ticket.id,
      performanceId: walkUp.performanceId,
    }))),
  ]

  if (soldResolved.length > 0 || ticketLines.length > 0) {
    const posted = postEntry({
      source: 'TILL',
      tender: tab ? 'TAB' : 'CARD',
      actorId: context.actorId,
      tabDebtorId: tab?.holderId ?? null,
      lines: [...soldResolved.map((line, index) => ({
        kind: 'BAR_ITEM' as const,
        // Net of the discount: what actually moved, the ledger's own meaning for the column
        // (F-117 criterion 3). The gross figure and the cut that reached it are its own columns.
        amountPence: line.amountPence - soldPriced[index]!.discountPence,
        qty: line.qty,
        unitPricePence: line.variant.pricePence,
        productVariantId: line.variant.id,
        priceRef: priceRef(line.variant.priceSource, line.variant.priceRowId),
        choices: line.choiceItemId ? { choiceItemId: line.choiceItemId, choiceItemName: line.choiceItemName } : null,
        discountId: discount?.id ?? null,
        discountPercent: discount?.percent ?? null,
        discountPence: soldPriced[index]!.discountPence || null,
        // Without this a matinee sale is invisible to its own report (E-127 criterion 6).
        performanceId: performanceId,
      })), ...ticketLines],
    }, new Date(), tab?.guard ?? undefined)
    statements.push(...posted.statements)
    // Every movement cites the sale line that caused it (F-105 criterion 3), which is only known
    // once `postEntry` has assigned that line's id; a movement of zero never reaches the batch (0010).
    soldResolved.forEach((line, index) => {
      const lineId = posted.lineIds[index]!
      for (const ingredient of line.depletion) {
        // Conditional on the entry, which a tab charge at its cap may not have written: stock
        // never moves for a sale that did not post (0001, F-105 criterion 1).
        statements.push(db.run(sql`
          INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id, actor_id)
          SELECT ${newId()}, ${ingredient.itemId}, ${-(ingredient.qty * line.qty)}, 'SALE', 'ledger_lines', ${lineId}, ${context.actorId}
          WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
        `))
      }
    })
    // Audit rides the same condition as the sale it records (0027): a charge the cap refused is
    // not a sale, and the trail must not say one happened.
    const audited = (row: AuditRow): void => {
      statements.push(db.run(sql`
        INSERT INTO audit_log (id, actor_id, action, target, detail)
        SELECT ${row.id}, ${row.actorId}, ${row.action}, ${row.target}, ${row.detail !== null ? JSON.stringify(row.detail) : null}
        WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
      `))
    }
    audited(auditEntry({
      actorId: context.actorId,
      action: 'bar.till.sale',
      target: `till-session:${context.sessionId}`,
      detail: {
        venueId: context.venueId,
        night: context.night,
        lines: soldResolved.length,
        ticketLines: ticketLines.length,
        discountId: discount?.id ?? null,
        tender: tab ? 'TAB' : 'CARD',
      },
    }))
    // A separate row from the sale itself: real because `actorId` above is only set by whoever
    // was actually signed in to submit it (F-108 criterion 4).
    if (tab?.capOverridden) {
      audited(auditEntry({
        actorId: context.actorId,
        action: 'bar.tab.cap-overridden',
        target: `till-session:${context.sessionId}`,
        detail: { tabHolderId: tab.holderId, chargePence: soldTotalPence },
      }))
    }
    entryId = posted.id
  }

  let ageCheckResult: SaleReceipt['ageCheck'] = null
  if (ageCheck && restricted.length > 0) {
    const id = newId()
    const restrictedNames = [...new Set(restricted.map(index => priced[index]!.productName))]
    const write = recordAgeCheck(context.actorId, {
      performanceId: performanceId,
      outcome: ageCheck.outcome,
      idType: ageCheck.idType,
      reason: ageCheck.reason,
      description: ageCheck.description,
      product: restrictedNames.join(', '),
      notes: ageCheck.notes,
    }, id)
    // Deliberately not conditional on the entry, unlike the sale's own writes above: the check is
    // a conversation that happened, and it reaches the register whether a sale followed (F-106).
    statements.push(db.run(write.statement))
    statements.push(db.insert(schema.auditLog).values(auditEntry({
      actorId: context.actorId,
      action: 'age-check.logged',
      target: `age-check:${id}`,
      detail: { outcome: ageCheck.outcome },
    })))
    ageCheckResult = { id, outcome: ageCheck.outcome }
  }

  try {
    await runLedgerBatch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  catch (error) {
    // The trigger's predicate is what refuses an oversell (0070); a read-then-check here would
    // race the same way on-hand always must not (F-105 criterion 5), so this catches its abort.
    if (error instanceof Error && error.message.includes('stock_movements_sale_exceeds_on_hand')) {
      throw createError({ statusCode: 409, statusMessage: 'Not enough left in stock for this sale: nothing has been charged.' })
    }
    if (error instanceof Error) {
      const refusal = ageCheckConstraintRefusal(error)
      if (refusal) throw createError(refusal)
    }
    // A booking the desk collected between the read and the write: the guarded UPDATE matched
    // nothing, so the trigger refused its line and the batch rolled back (0001).
    if (error instanceof Error && error.message.includes('ledger_lines_ticket_collection_needs_collected_reservation')) {
      throw createError({ statusCode: 409, statusMessage: 'One of those bookings was collected elsewhere just now. Nothing has been charged: look it up again.' })
    }
    throw error
  }

  // The cap's own refusal, read back: the guard on the entry wrote nothing, and everything that
  // depended on it carried the same condition, so there is nothing to undo (F-108 criterion 3).
  if (tab?.guard && entryId && !await entryExists(entryId)) {
    throw createError({
      statusCode: 409,
      statusMessage: `${tab.holderName}'s tab reached the cap while this was being charged. `
        + 'Nothing has been charged: read the tab and try again, or ask a duty manager or bar manager to override.',
    })
  }

  // Summed after the batch rather than added to the figure read before it: another till may have
  // charged the same holder in between, and the receipt is where staff read the balance (F-108).
  const settledBalancePence = tab ? await outstandingTabBalance(tab.holderId) : 0

  // The door pass (F-123 criterion 4), and the email for a booker who gave an address (criterion 2).
  const walkUpReceipts: WalkUpReceipt[] = []
  for (const walkUp of written) {
    const token = await qrTokenFor(walkUp.reservationId)
    const url = `${context.baseURL ?? ''}/qr/${token}`
    walkUpReceipts.push({
      reservationId: walkUp.reservationId,
      reference: walkUp.reference,
      performanceId: walkUp.performanceId,
      showTitle: walkUp.showTitle,
      partySize: walkUp.partySize,
      amountPence: walkUp.amountPence,
      qrUrl: url,
      qrSvg: qrSvgBase64(url),
    })
    if (booker) {
      await sendWalkUpPaid(context.event, {
        userId: booker.id,
        reference: walkUp.reference,
        showTitle: walkUp.showTitle,
        startsAt: walkUp.startsAt,
        paidPence: walkUp.amountPence,
        qrToken: token,
      })
    }
  }

  const collected: CollectedTicketLine[] = bookings.map(booking => ({ reservationId: booking.id, reference: booking.reference, amountPence: booking.owedPence }))

  return {
    entryId,
    totalPence: soldTotalPence,
    lines: soldPriced,
    ageCheck: ageCheckResult,
    refusedLines: refusedPriced,
    discount: publicDiscount(discount),
    tab: tab ? { holderName: tab.holderName, outstandingPence: settledBalancePence, capOverridden: tab.capOverridden } : null,
    comp: null,
    tickets: collected,
    walkUps: walkUpReceipts,
  }
}

// Spends an already-approved comp request (F-110): the basket it names, never one resubmitted by
// the till, so an approval can never be stretched to cover a bigger round than was asked for.
export async function commitCompSale(
  requestId: string,
  on: string,
  expectedForegonePence: number,
  ageCheck: InlineAgeCheckInput | null,
  context: SaleContext,
): Promise<SaleReceipt> {
  const expiryMinutes = await configValue(undefined, 'COMP_REQUEST_EXPIRY_MINUTES')
  const request = await compRequestById(requestId, expiryMinutes)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such comp request' })
  if (request.status !== 'APPROVED') {
    throw createError({ statusCode: 409, statusMessage: request.status === 'PENDING' ? 'That request has not been approved yet' : 'That request was declined' })
  }
  // A comp is spent where it was approved, never at another venue's session on a two-house night
  // (F-110).
  if (request.venueId !== context.venueId) {
    throw createError({ statusCode: 409, statusMessage: 'That request was approved for a different venue' })
  }
  // Already given wins over lapsed: a retry of a spent request that has since aged past the
  // window must say it was given, not that it lapsed (`expired` is now computed for APPROVED too).
  if (request.entryId) throw createError({ statusCode: 409, statusMessage: 'That comp has already been given' })
  if (request.expired) throw createError({ statusCode: 409, statusMessage: 'That request has lapsed; ask again' })

  const lines = await compRequestLines(requestId)
  if (!lines) throw createError({ statusCode: 404, statusMessage: 'No such comp request' })

  // The house the ask named, because that is where it was asked for; only an older request that
  // never recorded one falls back to resolving it now (F-126 criterion 4).
  const performanceId = request.performanceId ?? await performanceForSale(context, Math.floor(Date.now() / 1000))

  // A comp is never discounted on top: it is already free (F-110's own criterion 4).
  const { resolved, priced } = await resolveSale(lines, on, null)
  const { restricted, sold } = saleableAfterAgeCheck(resolved, priced, ageCheck)

  if (restricted.length > 0 && !ageCheck) {
    const names = [...new Set(restricted.map(index => priced[index]!.productName))]
    throw createError({
      statusCode: 409,
      statusMessage: `${names.join(' and ')} ${names.length === 1 ? 'needs' : 'need'} a Challenge 25 outcome before this can be given`,
    })
  }

  const soldResolved = sold.map(index => resolved[index]!)
  const soldPriced = sold.map(index => priced[index]!)
  const refusedPriced = restricted.filter(index => !sold.includes(index)).map(index => priced[index]!)
  const foregonePence = soldPriced.reduce((sum, line) => sum + line.amountPence, 0)

  if (foregonePence !== expectedForegonePence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysMoney(expectedForegonePence)} was being given away; the till now reads ${saysMoney(foregonePence)}. `
        + 'Nothing has been given: check the basket and try again.',
    })
  }

  if (soldResolved.length === 0) {
    return { entryId: null, totalPence: 0, lines: soldPriced, ageCheck: null, refusedLines: refusedPriced, tab: null, discount: null, comp: null, tickets: [], walkUps: [] }
  }

  const entryId = newId()
  const claimed = await claimCompRequestForSale(requestId, entryId, expiryMinutes)
  if (!claimed) {
    throw createError({ statusCode: 409, statusMessage: 'That comp is no longer available to give: it may have just been spent or have lapsed' })
  }

  const statements: BatchItem<'sqlite'>[] = []
  const posted = postEntry({
    id: entryId,
    source: 'TILL',
    tender: 'COMP',
    actorId: context.actorId,
    compReason: request.reason,
    compApprovedBy: request.decidedBy,
    // Zero moves, but the retail price is snapshotted onto each line, so the foregone value is
    // queryable as unit_price_pence * qty without any special-casing (F-110 criterion 4).
    lines: soldResolved.map(line => ({
      kind: 'BAR_ITEM',
      amountPence: 0,
      qty: line.qty,
      unitPricePence: line.variant.pricePence,
      productVariantId: line.variant.id,
      priceRef: priceRef(line.variant.priceSource, line.variant.priceRowId),
      choices: line.choiceItemId ? { choiceItemId: line.choiceItemId, choiceItemName: line.choiceItemName } : null,
      performanceId: performanceId,
    })),
  })
  statements.push(...posted.statements)
  soldResolved.forEach((line, index) => {
    const lineId = posted.lineIds[index]!
    for (const ingredient of line.depletion) {
      statements.push(db.insert(schema.stockMovements).values({
        id: newId(),
        itemId: ingredient.itemId,
        qty: -(ingredient.qty * line.qty),
        kind: 'COMP',
        refTable: 'ledger_lines',
        refId: lineId,
        actorId: context.actorId,
      }))
    }
  })
  statements.push(db.insert(schema.auditLog).values(auditEntry({
    actorId: context.actorId,
    action: 'bar.till.sale',
    target: `till-session:${context.sessionId}`,
    detail: { venueId: context.venueId, night: context.night, lines: soldResolved.length, tender: 'COMP', compRequestId: requestId },
  })))

  let ageCheckResult: SaleReceipt['ageCheck'] = null
  if (ageCheck && restricted.length > 0) {
    const id = newId()
    const restrictedNames = [...new Set(restricted.map(index => priced[index]!.productName))]
    const write = recordAgeCheck(context.actorId, {
      performanceId: performanceId,
      outcome: ageCheck.outcome,
      idType: ageCheck.idType,
      reason: ageCheck.reason,
      description: ageCheck.description,
      product: restrictedNames.join(', '),
      notes: ageCheck.notes,
    }, id)
    statements.push(db.run(write.statement))
    statements.push(db.insert(schema.auditLog).values(auditEntry({
      actorId: context.actorId,
      action: 'age-check.logged',
      target: `age-check:${id}`,
      detail: { outcome: ageCheck.outcome },
    })))
    ageCheckResult = { id, outcome: ageCheck.outcome }
  }

  try {
    await runLedgerBatch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  catch (error) {
    // Frees the request rather than losing it to a claim that never became a sale: a restock and a
    // retry can still spend the same approval, right up to its expiry.
    await releaseCompRequestClaim(requestId, entryId)
    if (error instanceof Error && error.message.includes('stock_movements_sale_exceeds_on_hand')) {
      throw createError({ statusCode: 409, statusMessage: 'Not enough left in stock to give this: nothing has been given.' })
    }
    if (error instanceof Error) {
      const refusal = ageCheckConstraintRefusal(error)
      if (refusal) throw createError(refusal)
    }
    throw error
  }

  return {
    entryId,
    totalPence: 0,
    lines: soldPriced,
    ageCheck: ageCheckResult,
    refusedLines: refusedPriced,
    tab: null,
    discount: null,
    comp: { reason: request.reason, foregonePence },
    tickets: [],
    walkUps: [],
  }
}
