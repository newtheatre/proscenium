import z from 'zod'
import type { ReservationStatus } from '~~/prisma/generated/client'
import prisma from '~~/server/database'

const bodySchema = z.object({
  customerName: z.string().min(1).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  adminNotes: z.string().optional().nullable(),
  status: z.enum([
    'PENDING_COLLECTION',
    'COLLECTED',
    'PURCHASED_ON_DOOR',
    'CANCELLED_BY_CUSTOMER',
    'CANCELLED_BY_ADMIN',
    'NO_SHOW',
    'EXPIRED',
  ]).optional(),
  tickets: z.array(z.object({
    ticketTypeId: z.string(),
    quantity: z.number().int().min(0),
  })).optional(),
})

// PUT /api/v2/reservations/[code]
//
// Updates a reservation. (admin or manager only)
export default defineEventHandler(async (event) => {
  await requireFOHAccess(event)

  const reservationCode = getRouterParam(event, 'code')

  if (!reservationCode) {
    throw createError({
      statusCode: 400,
      message: 'Reservation code is required',
    })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // Find the reservation with performance info
  const reservation = await prisma.reservation.findUnique({
    where: { reservationCode },
    select: {
      id: true,
      performanceId: true,
      performance: {
        select: {
          showId: true,
        },
      },
    },
  })

  if (!reservation) {
    throw createError({
      statusCode: 404,
      message: 'Reservation not found',
    })
  }

  // If tickets are being updated, recalculate pricing
  let totalPrice: number | undefined

  if (body.tickets && body.tickets.length > 0) {
    // Remove tickets with 0 quantity
    const validTickets = body.tickets.filter(t => t.quantity > 0)

    if (validTickets.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'Reservation must have at least one ticket',
      })
    }

    // Calculate new total price and prepare ticket data
    totalPrice = 0

    const ticketDataToCreate: Array<{
      reservationId: string
      ticketTypeId: string
      quantity: number
      pricePerItemAtReservation: number
      ticketTypeNameAtReservation: string
      performanceTicketPriceId: string | null
      showTicketPriceId: string | null
    }> = []

    for (const ticketUpdate of validTickets) {
      // Get effective price for this ticket type
      const performancePrice = await prisma.performanceTicketPrice.findFirst({
        where: {
          performanceId: reservation.performanceId,
          ticketTypeId: ticketUpdate.ticketTypeId,
          isActive: true,
        },
        select: { price: true, id: true },
      })

      let ticketPrice = performancePrice?.price
      let showTicketPriceId: string | null = null
      const performanceTicketPriceId = performancePrice?.id || null

      if (!ticketPrice && reservation.performance.showId) {
        const showPrice = await prisma.showTicketPrice.findFirst({
          where: {
            showId: reservation.performance.showId,
            ticketTypeId: ticketUpdate.ticketTypeId,
            isActive: true,
          },
          select: { price: true, id: true },
        })
        ticketPrice = showPrice?.price
        showTicketPriceId = showPrice?.id || null
      }

      // Get ticket type for name and default price
      const ticketType = await prisma.ticketType.findUnique({
        where: { id: ticketUpdate.ticketTypeId },
        select: { name: true, defaultPrice: true },
      })

      if (!ticketType) {
        throw createError({
          statusCode: 404,
          message: `Ticket type not found: ${ticketUpdate.ticketTypeId}`,
        })
      }

      if (!ticketPrice) {
        ticketPrice = ticketType.defaultPrice
      }

      totalPrice += ticketPrice * ticketUpdate.quantity

      ticketDataToCreate.push({
        reservationId: reservation.id,
        ticketTypeId: ticketUpdate.ticketTypeId,
        quantity: ticketUpdate.quantity,
        pricePerItemAtReservation: ticketPrice,
        ticketTypeNameAtReservation: ticketType.name,
        performanceTicketPriceId,
        showTicketPriceId,
      })
    }

    // Delete existing tickets and create new ones
    await prisma.reservedTicket.deleteMany({
      where: { reservationId: reservation.id },
    })

    await prisma.reservedTicket.createMany({
      data: ticketDataToCreate,
    })
  }

  // Prepare update data
  const updateData: {
    customerName?: string
    customerEmail?: string
    customerPhone?: string | null
    notes?: string | null
    adminNotes?: string | null
    status?: ReservationStatus
    totalPrice?: number
  } = {}

  if (body.customerName !== undefined) updateData.customerName = body.customerName
  if (body.customerEmail !== undefined) updateData.customerEmail = body.customerEmail
  if (body.customerPhone !== undefined) updateData.customerPhone = body.customerPhone
  if (body.notes !== undefined) updateData.notes = body.notes
  if (body.adminNotes !== undefined) updateData.adminNotes = body.adminNotes
  if (body.status !== undefined) updateData.status = body.status as ReservationStatus
  if (totalPrice !== undefined) updateData.totalPrice = totalPrice

  // Update the reservation
  const updatedReservation = await prisma.reservation.update({
    where: { reservationCode },
    data: updateData,
    select: {
      id: true,
      reservationCode: true,
      status: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      notes: true,
      adminNotes: true,
      totalPrice: true,
      reservedTickets: {
        select: {
          id: true,
          quantity: true,
          ticketTypeNameAtReservation: true,
          pricePerItemAtReservation: true,
          ticketTypeId: true,
        },
      },
    },
  })

  return updatedReservation
})
