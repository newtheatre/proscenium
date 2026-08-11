import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod/v4'
import { sendBookingConfirmationEmail } from '~~/server/utils/email'

const bodySchema = z.object({
  performanceId: z.string().min(1),

  // Customer details — not required if the user is logged in
  name: z.string().min(1).optional(),
  email: z.email().optional(),

  // Tickets to book
  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.int().min(1).max(10),
  })).min(1, 'At least one ticket is required'),

  customerNotes: z.string().optional(),
})

/**
 * POST /api/bookings — create a new public booking.
 *
 * Public endpoint — anyone can book. If the user is logged in, their account
 * details are used. Otherwise, name + email are required and a shadow account
 * is created or matched.
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

  // Check performance is in the future
  if (performance.startsAt < new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'This performance has already started' })
  }

  // ── Check capacity ─────────────────────────────────────────────────────────

  const capacity = performance.capacityOverride ?? performance.venue.capacity

  if (capacity !== null && capacity !== undefined) {
    const [existing] = await db
      .select({ count: count() })
      .from(schema.tickets)
      .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
      .where(
        and(
          eq(schema.tickets.performanceId, body.performanceId),
          inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
          isNull(schema.tickets.refundedAt),
        ),
      )

    const totalRequested = body.tickets.reduce((sum, t) => sum + t.quantity, 0)
    const currentCount = existing?.count ?? 0

    if (currentCount + totalRequested > capacity) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Not enough tickets available for this performance',
      })
    }
  }

  // ── Resolve user ───────────────────────────────────────────────────────────

  let resolvedUserId: string

  if (loggedInUser) {
    resolvedUserId = loggedInUser.id
  }
  else {
    // Find existing account by email, or create a shadow account
    const existingUser = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, body.email!))
      .get()

    if (existingUser) {
      resolvedUserId = existingUser.id
    }
    else {
      const [shadowUser] = await db.insert(schema.users).values({
        email: body.email!,
        name: body.name!,
        password: null,
        verified: false,
      }).returning({ id: schema.users.id })

      if (!shadowUser) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to create guest account' })
      }
      resolvedUserId = shadowUser.id
    }
  }

  // ── Resolve effective ticket prices ───────────────────────────────────────

  const requestedTypeIds = body.tickets.map(t => t.ticketTypeId)
  const priceCtx = await loadTicketPriceContext(requestedTypeIds, performance.show.id, body.performanceId)
  // Reject types that are inactive for this show/performance. They are hidden in
  // the UI but reachable by ID, so a crafted request must not be able to book a
  // disabled or comp-only type at its (possibly £0) price.
  validateTicketTypesActive(requestedTypeIds, priceCtx)

  // ── Create reservation + tickets ──────────────────────────────────────────

  const [reservation] = await db.insert(schema.reservations).values({
    performanceId: body.performanceId,
    userId: resolvedUserId,
    customerNotes: body.customerNotes ?? null,
    status: 'PENDING',
  }).returning()

  if (!reservation) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create reservation' })
  }

  // Expand quantities into individual ticket rows
  const ticketRows = body.tickets.flatMap(({ ticketTypeId, quantity }) =>
    Array.from({ length: quantity }, () => ({
      reservationId: reservation.id,
      performanceId: body.performanceId,
      ticketTypeId,
      pricePaid: resolveEffectivePrice(ticketTypeId, priceCtx),
    })),
  )

  await db.insert(schema.tickets).values(ticketRows)

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

  const booking = await db.query.reservations.findFirst({
    where: (r, { eq }) => eq(r.id, reservation.id),
    with: {
      user: { columns: { id: true, name: true, email: true } },
      performance: {
        with: {
          show: { columns: { id: true, title: true, slug: true } },
          venue: { columns: { id: true, name: true, address: true } },
        },
      },
      tickets: {
        with: {
          ticketType: { columns: { id: true, name: true } },
        },
      },
    },
  }) as BookingResult | undefined

  // Send confirmation email (don't block the response, but keep the worker alive)
  if (booking) {
    const emailPromise = sendBookingConfirmationEmail({
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
