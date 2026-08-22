import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { sendBookingConfirmationEmail } from '~~/server/utils/email'

const bodySchema = z.object({
  performanceId: z.string().min(1),

  // Bounded because this endpoint is unauthenticated and both values are stored
  // and later rendered into an email the caller also addresses.
  name: z.string().trim().min(1).max(100).optional(),
  email: z.email().max(254).optional(),

  // Tickets to book
  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.int().min(1).max(10),
  })).min(1, 'At least one ticket is required'),

  // Access requirements and similar. Capped so an unauthenticated caller cannot
  // use it as free storage, or pad an email past a provider's size limit.
  customerNotes: z.string().trim().max(500).optional(),
})

/**
 * POST /api/bookings — create a new public booking.
 */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  // Check if user is logged in
  const session = await getUserSession(event)
  const loggedInUser = session?.user

  // Validate that we have customer details either from session or from the body
  if (!loggedInUser && (!body.name || !body.email)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name and email are required for guest bookings',
    })
  }

  // Narrower than the per-IP limit, and keyed on the session's own address:
  // body.email is ignored for a signed-in caller, so it is free to vary (ADR-0015).
  const guestEmail = (loggedInUser?.email ?? body.email)?.trim().toLowerCase()
  if (guestEmail) {
    await assertRateLimit(
      event,
      [{ key: `booking-create:email:${guestEmail}`, limit: 8, windowSeconds: 3600 }],
      'That email address has made several bookings just now. Please wait a little while, or call the box office.',
    )
  }

  // ── Validate performance ───────────────────────────────────────────────────

  const performance = await db.query.performances.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, body.performanceId), eq(p.status, 'ON_SALE')),
    with: {
      show: { columns: { id: true, title: true, slug: true, status: true } },
      venue: { columns: { id: true, name: true, capacity: true } },
    },
  })

  if (!performance) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found or not on sale' })
  }

  if (performance.show.status !== 'PUBLISHED') {
    throw createError({ statusCode: 400, statusMessage: 'Show is not currently published' })
  }

  // Staff endpoints do not call this — the box office takes walk-ups after
  // online booking closes, which is the point of closing it early.
  assertBookingOpen(performance)

  // ── Check capacity ─────────────────────────────────────────────────────────

  const totalRequested = body.tickets.reduce((sum, t) => sum + t.quantity, 0)
  await assertCapacity(body.performanceId, totalRequested)

  // ── Resolve user ───────────────────────────────────────────────────────────

  // Identity is central (stage-door ADR-0007): ask for a shadow account by
  // email, then mirror the canonical id locally.
  let resolvedUserId: string
  let needShadowUser = false

  if (loggedInUser) {
    resolvedUserId = loggedInUser.id
  }
  else {
    const config = useRuntimeConfig(event)
    if (!config.authServiceToken) {
      throw createError({ statusCode: 502, statusMessage: 'Booking is temporarily unavailable — please try again shortly' })
    }

    let shadow: { id: string, existing: boolean }
    try {
      shadow = await $fetch<{ id: string, existing: boolean }>(
        `${config.public.authBaseURL}/api/users/shadow`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.authServiceToken}` },
          body: { email: body.email!, name: body.name! },
        },
      )
    }
    catch (error) {
      // Fail the booking with a retry message rather than inventing a local id that
      // would diverge from the canonical store.
      console.error('[bookings] shadow-account call failed:', error)
      throw createError({ statusCode: 502, statusMessage: 'Booking is temporarily unavailable — please try again shortly' })
    }

    resolvedUserId = shadow.id
    // Mirror row may not exist yet (new shadow, or existing user who has
    // never hit this app since cutover) — upsert it in the booking batch.
    const mirror = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, shadow.id))
      .get()
    needShadowUser = !mirror
  }

  // ── Resolve effective ticket prices ───────────────────────────────────────

  // Gated server-side, not merely hidden from the picker (docs/12 §2.6).
  await assertAccessTicketsAllowed(resolvedUserId, body.performanceId, body.tickets)

  const requestedTypeIds = body.tickets.map(t => t.ticketTypeId)
  const priceCtx = await loadTicketPriceContext(requestedTypeIds, performance.show.id, body.performanceId)
  // Inactive types are hidden in the UI but reachable by id, so a crafted
  // request must not be able to book a disabled or comp-only type.
  validateTicketTypesActive(requestedTypeIds, priceCtx)

  // ── Create shadow user (if needed) + reservation + tickets, atomically ─────

  const reservationId = nanoid()

  // Expand quantities into individual ticket rows
  const ticketRows = body.tickets.flatMap(({ ticketTypeId, quantity }) =>
    Array.from({ length: quantity }, () => ({
      reservationId,
      performanceId: body.performanceId,
      ticketTypeId,
      pricePaid: resolveEffectivePrice(ticketTypeId, priceCtx),
    })),
  )

  const reservationInsert = db.insert(schema.reservations).values({
    id: reservationId,
    performanceId: body.performanceId,
    userId: resolvedUserId,
    customerNotes: body.customerNotes ?? null,
    status: 'PENDING',
  })
  // One statement per chunk: a 17-ticket group booking would otherwise bind
  // 100+ parameters in a single insert, which D1 refuses (ADR-0006).
  const ticketInserts = chunked(ticketRows, TICKET_ROWS_PER_INSERT)
    .map(rows => db.insert(schema.tickets).values(rows))

  if (needShadowUser) {
    await db.batch([
      db.insert(schema.users).values({
        id: resolvedUserId,
        email: body.email!.toLowerCase(),
        name: body.name!,
      }),
      reservationInsert,
      ...ticketInserts,
    ])
  }
  else {
    await db.batch([reservationInsert, ...ticketInserts])
  }

  // Return the full booking details
  interface BookingResult {
    id: string
    bookingRef: string
    status: string
    customerNotes: string | null
    user: { id: string, name: string, email: string }
    performance: {
      startsAt: Date
      show: { id: string, title: string, slug: string }
      venue: { id: string, name: string, address: string | null }
    }
    tickets: Array<{
      id: string
      pricePaid: number
      ticketType: { id: string, name: string }
    }>
  }

  // Allow-listed: without `columns` Drizzle returns staffNotes and legacyRef,
  // and this response goes straight to the customer.
  const booking = await db.query.reservations.findFirst({
    where: (r, { eq }) => eq(r.id, reservationId),
    columns: reservationCustomerColumns,
    with: reservationCustomerWith,
  }) as BookingResult | undefined

  // Send confirmation email (don't block the response, but keep the worker alive)
  if (booking) {
    const emailPromise = sendBookingConfirmationEmail({
      bookingId: booking.id,
      bookingRef: booking.bookingRef,
      customerName: booking.user.name,
      customerEmail: booking.user.email,
      showTitle: booking.performance.show.title,
      showSlug: booking.performance.show.slug,
      venueName: booking.performance.venue.name,
      performanceDate: booking.performance.startsAt,
      tickets: booking.tickets,
      customerNotes: booking.customerNotes,
    }).catch((err: unknown) => console.error('[Email] Failed to send booking confirmation:', err))

    // Keep the Cloudflare Worker alive until the email is sent
    event.context.cloudflare?.context.waitUntil(emailPromise)
  }

  return booking
})
