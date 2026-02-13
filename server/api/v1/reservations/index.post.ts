/**
 * POST /api/v1/reservations
 *
 * Creates a new ticket reservation for a performance. No authentication required for guest reservations.
 *
 * Request Body:
 * @param {string} performanceId - ID of the performance to reserve tickets for
 * @param {ReservedTicketInput[]} tickets - Array of ticket types and quantities to reserve
 * @param {string} customerName - Customer's full name
 * @param {string} customerEmail - Customer's email address
 * @param {string} [customerPhone] - Customer's phone number (optional)
 * @param {string} [notes] - Customer notes or special requests
 * @param {string} [userId] - User ID if authenticated (optional)
 *
 * ReservedTicketInput:
 * {
 *   ticketTypeId: string,
 *   quantity: number
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     reservation: {
 *       id: string,
 *       reservationCode: string,
 *       totalPrice: number,
 *       status: ReservationStatus,
 *       collectionDeadline: string | null,
 *       customerName: string,
 *       customerEmail: string,
 *       reservedTickets: ReservedTicket[],
 *       performance: {
 *         id: string,
 *         performanceDateTime: string,
 *         venue: Venue,
 *         show: Show
 *       }
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Validates input data and performance availability
 * 2. Checks ticket availability for requested quantities
 * 3. Calculates total price based on current pricing
 * 4. Creates reservation with PENDING_COLLECTION status
 * 5. Sends confirmation email to customer
 * 6. Returns reservation details
 *
 * Error Responses:
 * - 400: Invalid input data or insufficient ticket availability
 * - 404: Performance or ticket types not found
 * - 409: Requested tickets no longer available
 * - 500: Internal server error
 */
import prisma from '~~/server/database'
import { sendReservationConfirmationEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Basic validation TODO: replace with zod schema validation
    if (!body.performanceId || !body.customerName || !body.customerEmail || !body.tickets?.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required fields: performanceId, customerName, customerEmail, and tickets',
      })
    }

    // Check if performance exists and is available for reservations
    const performance = await prisma.performance.findUnique({
      where: { id: body.performanceId },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        runtimeMinutes: true,
        intervalMinutes: true,
        maxCapacity: true,
        show: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!performance) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Performance not found',
      })
    }

    if (performance.show?.status !== 'PUBLISHED') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Reservations are not available for this show',
      })
    }

    // Check capacity
    const currentReservations = await prisma.reservedTicket.aggregate({
      where: {
        reservation: {
          performanceId: body.performanceId,
          status: { notIn: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN'] },
        },
      },
      _sum: { quantity: true },
    })

    const totalReserved = currentReservations._sum.quantity ?? 0
    const requestedQuantity = body.tickets.reduce((sum: number, ticket: { quantity?: number }) => sum + (ticket.quantity || 0), 0)

    if (totalReserved + requestedQuantity > performance.maxCapacity) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Not enough tickets available for this performance',
      })
    }

    // Generate reservation code
    const reservationCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    // Pre-calculate prices and gather ticket data (outside transaction for D1 compatibility)
    let calculatedTotalPrice = 0
    const ticketDataForCreation: Array<{
      ticketTypeId: string
      quantity: number
      price: number
      name: string
      showTicketPriceId: string | null
      performanceTicketPriceId: string | null
    }> = []

    // Lookup prices for each ticket type
    for (const ticketRequest of body.tickets) {
      // Priority: 1. Performance-specific price, 2. Show-specific price, 3. Default price
      const performancePrice = await prisma.performanceTicketPrice.findUnique({
        where: {
          performanceId_ticketTypeId: {
            performanceId: body.performanceId,
            ticketTypeId: ticketRequest.ticketTypeId,
          },
          isActive: true,
        },
        select: { price: true, id: true },
      })

      let ticketPrice = performancePrice?.price
      let showTicketPriceId = null
      const performanceTicketPriceId = performancePrice?.id || null

      // Check if price is undefined/null (allows 0)
      if (ticketPrice === undefined || ticketPrice === null) {
        const showPrice = await prisma.showTicketPrice.findUnique({
          where: {
            showId_ticketTypeId: {
              showId: performance.show!.id,
              ticketTypeId: ticketRequest.ticketTypeId,
            },
            isActive: true,
          },
          select: { price: true, id: true },
        })
        ticketPrice = showPrice?.price
        showTicketPriceId = showPrice?.id || null
      }

      // Get ticket type info
      const ticketType = await prisma.ticketType.findUnique({
        where: { id: ticketRequest.ticketTypeId },
        select: { name: true, defaultPrice: true },
      })

      if (!ticketType) {
        throw createError({
          statusCode: 404,
          statusMessage: `Ticket type not found: ${ticketRequest.ticketTypeId}`,
        })
      }

      // Fallback to default price if still undefined/null
      if (ticketPrice === undefined || ticketPrice === null) {
        ticketPrice = ticketType.defaultPrice
      }

      // Final validation (ensure price is defined, even if 0)
      if (ticketPrice === undefined || ticketPrice === null) {
        throw createError({
          statusCode: 400,
          statusMessage: `Ticket type has no price configured: ${ticketRequest.ticketTypeId}`,
        })
      }

      calculatedTotalPrice += ticketPrice * ticketRequest.quantity

      ticketDataForCreation.push({
        ticketTypeId: ticketRequest.ticketTypeId,
        quantity: ticketRequest.quantity,
        price: ticketPrice,
        name: ticketType.name,
        showTicketPriceId,
        performanceTicketPriceId,
      })
    }

    // Create reservation first
    const newReservation = await prisma.reservation.create({
      data: {
        performanceId: body.performanceId,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        customerPhone: body.customerPhone,
        notes: body.notes,
        reservationCode,
        totalPrice: calculatedTotalPrice,
        status: 'PENDING_COLLECTION',
      },
      select: {
        id: true,
        reservationCode: true,
        customerName: true,
        customerEmail: true,
        totalPrice: true,
        status: true,
        createdAt: true,
      },
    })

    // Create all reserved tickets in a batch transaction
    const ticketOperations = ticketDataForCreation.map(ticketData =>
      prisma.reservedTicket.create({
        data: {
          reservationId: newReservation.id,
          ticketTypeId: ticketData.ticketTypeId,
          quantity: ticketData.quantity,
          pricePerItemAtReservation: ticketData.price,
          ticketTypeNameAtReservation: ticketData.name,
          showTicketPriceId: ticketData.showTicketPriceId,
          performanceTicketPriceId: ticketData.performanceTicketPriceId,
        },
      }),
    )

    await prisma.$transaction(ticketOperations)

    const reservation = newReservation

    // Fetch the complete reservation with ticket details for email
    const completeReservation = await prisma.reservation.findUnique({
      where: { id: reservation.id },
      select: {
        id: true,
        reservationCode: true,
        customerName: true,
        customerEmail: true,
        totalPrice: true,
        reservedTickets: {
          select: {
            quantity: true,
            pricePerItemAtReservation: true,
            ticketTypeNameAtReservation: true,
          },
        },
      },
    })

    // Send confirmation email to customer
    try {
      await sendReservationConfirmationEmail({
        to: reservation.customerEmail,
        reservationCode: reservation.reservationCode,
        customerName: reservation.customerName,
        performanceTitle: performance.title || 'Performance',
        performanceDate: performance.startDateTime.toISOString(),
        showTitle: performance.show?.title || 'Show',
        venueName: performance.venue?.name || 'Venue',
        totalPrice: reservation.totalPrice,
        tickets: completeReservation?.reservedTickets.map(ticket => ({
          quantity: ticket.quantity,
          name: ticket.ticketTypeNameAtReservation,
          price: ticket.pricePerItemAtReservation * ticket.quantity,
        })) || [],
      })
    }
    catch (emailError) {
      // Log email error but don't fail the reservation
      console.error('Failed to send reservation confirmation email:', emailError)
    }

    return successResponse(
      {
        ...reservation,
        performance: {
          id: performance.id,
          title: performance.title,
          startDateTime: performance.startDateTime,
          show: performance.show,
          venue: performance.venue,
        },
      },
      `Reservation ${reservation.reservationCode} created successfully`,
    )
  }
  catch (error) {
    return handleApiError(error)
  }
})
