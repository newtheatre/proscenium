import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import { sendBookingConfirmationEmail } from '~~/server/utils/email'

const bodySchema = z.object({
  performanceId: z.string().min(1),

  // Customer details — not required if the user is logged in.
  // Both are bounded: this endpoint is unauthenticated, and both values are
  // stored and later rendered into an email whose recipient the caller chooses.
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

  // Guest checkout mails whatever address the caller supplies, from the
  // theatre's own domain. The per-IP middleware limit is generous for shared
  // connections, so this narrower bucket bounds how often one *address* can be
  // mailed (ADR-0015).
  const guestEmail = (body.email ?? loggedInUser?.email)?.trim().toLowerCase()
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

  // Online booking closes at startsAt minus bookingClosesHoursBefore, which the
  // legacy import populated for 1,254 performances. Staff endpoints do not call
  // this — the box office still takes walk-ups after the online cutoff.
  assertBookingOpen(performance)

  // ── Check capacity ─────────────────────────────────────────────────────────

  const totalRequested = body.tickets.reduce((sum, t) => sum + t.quantity, 0)
  await assertCapacity(body.performanceId, totalRequested)

  // ── Resolve user ───────────────────────────────────────────────────────────

  // Identity lives in the central auth service (stage-door ADR-0007): guest
  // checkout asks it to match-or-create a shadow account by email, then the
  // canonical id is mirrored locally in the same atomic batch as the booking
  // (reservations.user_id FKs the mirror). Idempotent on the auth side, so a
  // retried request is safe.
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
      // Bookings/min is tiny; fail the booking with a retry message rather
      // than inventing local identity that would diverge from the canonical
      // store (plan §4.8).
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

  const requestedTypeIds = body.tickets.map(t => t.ticketTypeId)
  const priceCtx = await loadTicketPriceContext(requestedTypeIds, performance.show.id, body.performanceId)
  // Reject types that are inactive for this show/performance. They are hidden in
  // the UI but reachable by ID, so a crafted request must not be able to book a
  // disabled or comp-only type at its (possibly £0) price.
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
  const ticketsInsert = db.insert(schema.tickets).values(ticketRows)

  if (needShadowUser) {
    await db.batch([
      db.insert(schema.users).values({
        id: resolvedUserId,
        email: body.email!.toLowerCase(),
        name: body.name!,
      }),
      reservationInsert,
      ticketsInsert,
    ])
  }
  else {
    await db.batch([reservationInsert, ticketsInsert])
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

  const booking = await db.query.reservations.findFirst({
    where: (r, { eq }) => eq(r.id, reservationId),
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
