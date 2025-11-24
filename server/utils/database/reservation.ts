import prisma from '~~/server/database'
import type { Prisma } from '~~/prisma/generated/client'
import { dbErrors } from './index'
import { reservedTicketSelectQuery } from './ticket'

/**
 * Standardised reservation selection for consistent data across endpoints
 */
export const reservationSelectQuery = {
  id: true,
  reservationCode: true,
  totalPrice: true,
  reservationDateTime: true,
  status: true,
  notes: true,
  adminNotes: true,
  collectionDeadline: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  createdAt: true,
  updatedAt: true,
  performanceId: true,
  userId: true,
} satisfies Prisma.ReservationSelect

/**
 * Reservation selection with relations
 */
export const reservationWithRelationsSelectQuery = {
  ...reservationSelectQuery,
  performance: {
    select: {
      id: true,
      title: true,
      startDateTime: true,
      runtimeMinutes: true,
      intervalMinutes: true,
      type: true,
      show: {
        select: {
          id: true,
          title: true,
          slug: true,
          posterImageUrl: true,
        },
      },
      venue: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          name: true,
        },
      },
    },
  },
  reservedTickets: {
    select: reservedTicketSelectQuery,
    orderBy: {
      ticketType: {
        sortOrder: 'asc',
      },
    },
  },
} satisfies Prisma.ReservationSelect

/**
 * Reservation selection for public access (customer-facing)
 */
export const reservationPublicSelectQuery = {
  id: true,
  reservationCode: true,
  totalPrice: true,
  reservationDateTime: true,
  status: true,
  notes: true,
  collectionDeadline: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  performance: {
    select: {
      id: true,
      title: true,
      startDateTime: true,
      runtimeMinutes: true,
      intervalMinutes: true,
      type: true,
      show: {
        select: {
          id: true,
          title: true,
          slug: true,
          posterImageUrl: true,
        },
      },
      venue: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    },
  },
  reservedTickets: {
    select: {
      id: true,
      quantity: true,
      pricePerItemAtReservation: true,
      ticketTypeNameAtReservation: true,
      ticketType: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
    orderBy: {
      ticketType: {
        sortOrder: 'asc',
      },
    },
  },
} satisfies Prisma.ReservationSelect

/**
 * Types for reservation data returned from database
 */
export type ReservationWithRelationsRaw = Prisma.ReservationGetPayload<{
  select: typeof reservationSelectQuery
}>

export type ReservationWithFullRelationsRaw = Prisma.ReservationGetPayload<{
  select: typeof reservationWithRelationsSelectQuery
}>

export type ReservationPublicRaw = Prisma.ReservationGetPayload<{
  select: typeof reservationPublicSelectQuery
}>

/**
 * Create a new reservation with reserved tickets
 */
export async function createReservationWithTickets(
  performanceId: string,
  customerData: {
    customerName: string
    customerEmail: string
    customerPhone?: string
    userId?: string
  },
  ticketData: Array<{
    ticketTypeId: string
    quantity: number
    pricePerItemAtReservation: number
    ticketTypeNameAtReservation: string
    performanceTicketPriceId?: string
    showTicketPriceId?: string
  }>,
  reservationData?: {
    notes?: string
    adminNotes?: string
    collectionDeadline?: Date
  },
): Promise<ReservationWithFullRelationsRaw> {
  // Calculate total price
  const totalPrice = ticketData.reduce(
    (sum, ticket) => sum + (ticket.pricePerItemAtReservation * ticket.quantity),
    0,
  )

  const reservation = await prisma.reservation.create({
    data: {
      performanceId,
      totalPrice,
      customerName: customerData.customerName,
      customerEmail: customerData.customerEmail,
      customerPhone: customerData.customerPhone,
      userId: customerData.userId,
      notes: reservationData?.notes,
      adminNotes: reservationData?.adminNotes,
      collectionDeadline: reservationData?.collectionDeadline,
      reservedTickets: {
        create: ticketData,
      },
    },
    select: reservationWithRelationsSelectQuery,
  })

  return reservation
}

/**
 * Get all reservations with optional filtering
 */
export async function getReservations(filters?: {
  performanceId?: string
  status?: Prisma.EnumReservationStatusFilter
  customerEmail?: string
  customerName?: string
  reservationCode?: string
  userId?: string
  startDate?: Date
  endDate?: Date
  includeRelations?: boolean
  limit?: number
  offset?: number
}): Promise<ReservationWithRelationsRaw[] | ReservationWithFullRelationsRaw[]> {
  const where: Prisma.ReservationWhereInput = {}

  if (filters?.performanceId) {
    where.performanceId = filters.performanceId
  }

  if (filters?.status) {
    where.status = filters.status
  }

  if (filters?.customerEmail) {
    where.customerEmail = {
      contains: filters.customerEmail,
    }
  }

  if (filters?.customerName) {
    where.customerName = {
      contains: filters.customerName,
    }
  }

  if (filters?.reservationCode) {
    where.reservationCode = filters.reservationCode
  }

  if (filters?.userId) {
    where.userId = filters.userId
  }

  if (filters?.startDate || filters?.endDate) {
    where.reservationDateTime = {}
    if (filters.startDate) {
      where.reservationDateTime.gte = filters.startDate
    }
    if (filters.endDate) {
      where.reservationDateTime.lte = filters.endDate
    }
  }

  const selectQuery = filters?.includeRelations ? reservationWithRelationsSelectQuery : reservationSelectQuery

  return await prisma.reservation.findMany({
    where,
    select: selectQuery,
    orderBy: [
      { reservationDateTime: 'desc' },
    ],
    take: filters?.limit,
    skip: filters?.offset,
  })
}

/**
 * Get reservation by ID
 */
export async function getReservationById(
  id: string,
  includeRelations = false,
): Promise<ReservationWithRelationsRaw | ReservationWithFullRelationsRaw> {
  const selectQuery = includeRelations ? reservationWithRelationsSelectQuery : reservationSelectQuery

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: selectQuery,
  })

  if (!reservation) {
    throw dbErrors.notFound('Reservation')
  }

  return reservation
}

/**
 * Get reservation by code (for customer access)
 */
export async function getReservationByCode(
  code: string,
  publicAccess = false,
): Promise<ReservationWithFullRelationsRaw | ReservationPublicRaw> {
  const selectQuery = publicAccess ? reservationPublicSelectQuery : reservationWithRelationsSelectQuery

  const reservation = await prisma.reservation.findUnique({
    where: { reservationCode: code },
    select: selectQuery,
  })

  if (!reservation) {
    throw dbErrors.invalidReservationCode()
  }

  return reservation
}

/**
 * Update reservation by ID
 */
export async function updateReservation(
  id: string,
  data: Prisma.ReservationUpdateInput,
): Promise<ReservationWithFullRelationsRaw> {
  // Check if reservation exists
  await getReservationById(id)

  const reservation = await prisma.reservation.update({
    where: { id },
    data,
    select: reservationWithRelationsSelectQuery,
  })

  return reservation
}

/**
 * Update reservation by code (for customer access)
 */
export async function updateReservationByCode(
  code: string,
  data: Prisma.ReservationUpdateInput,
): Promise<ReservationPublicRaw> {
  // Check if reservation exists
  await getReservationByCode(code)

  const reservation = await prisma.reservation.update({
    where: { reservationCode: code },
    data,
    select: reservationPublicSelectQuery,
  })

  return reservation
}

/**
 * Delete reservation by ID
 */
export async function deleteReservation(id: string): Promise<void> {
  await prisma.reservation.delete({
    where: { id },
  })
}

/**
 * Delete reservation by code
 */
export async function deleteReservationByCode(code: string): Promise<void> {
  await prisma.reservation.delete({
    where: { reservationCode: code },
  })
}

/**
 * Collect reservation (mark as collected)
 */
export async function collectReservation(
  id: string,
  adminNotes?: string,
): Promise<ReservationWithFullRelationsRaw> {
  return await updateReservation(id, {
    status: 'COLLECTED',
    adminNotes,
  })
}

/**
 * Collect reservation by code
 */
export async function collectReservationByCode(
  code: string,
  adminNotes?: string,
): Promise<ReservationPublicRaw> {
  return await updateReservationByCode(code, {
    status: 'COLLECTED',
    adminNotes,
  })
}

/**
 * Cancel reservation
 */
export async function cancelReservation(
  id: string,
  reason: 'CANCELLED_BY_CUSTOMER' | 'CANCELLED_BY_ADMIN' = 'CANCELLED_BY_ADMIN',
  adminNotes?: string,
): Promise<ReservationWithFullRelationsRaw> {
  return await updateReservation(id, {
    status: reason,
    adminNotes,
  })
}

/**
 * Cancel reservation by code
 */
export async function cancelReservationByCode(
  code: string,
  reason: 'CANCELLED_BY_CUSTOMER' | 'CANCELLED_BY_ADMIN' = 'CANCELLED_BY_CUSTOMER',
  adminNotes?: string,
): Promise<ReservationPublicRaw> {
  return await updateReservationByCode(code, {
    status: reason,
    adminNotes,
  })
}

/**
 * Get reservations for a user
 */
export async function getUserReservations(
  userId: string,
  includeRelations = true,
): Promise<ReservationWithRelationsRaw[] | ReservationWithFullRelationsRaw[]> {
  return await getReservations({
    userId,
    includeRelations,
  })
}

/**
 * Get performance reservation summary
 */
export async function getPerformanceReservationSummary(performanceId: string): Promise<{
  totalReservations: number
  totalTickets: number
  collectedReservations: number
  collectedTickets: number
  pendingReservations: number
  pendingTickets: number
  cancelledReservations: number
  cancelledTickets: number
  revenue: number
  pendingRevenue: number
}> {
  const reservations = await prisma.reservation.findMany({
    where: { performanceId },
    select: {
      status: true,
      totalPrice: true,
      reservedTickets: {
        select: {
          quantity: true,
        },
      },
    },
  })

  const summary = {
    totalReservations: 0,
    totalTickets: 0,
    collectedReservations: 0,
    collectedTickets: 0,
    pendingReservations: 0,
    pendingTickets: 0,
    cancelledReservations: 0,
    cancelledTickets: 0,
    revenue: 0,
    pendingRevenue: 0,
  }

  for (const reservation of reservations) {
    const ticketCount = reservation.reservedTickets.reduce((sum, ticket) => sum + ticket.quantity, 0)

    summary.totalReservations++
    summary.totalTickets += ticketCount

    switch (reservation.status) {
      case 'COLLECTED':
      case 'PURCHASED_ON_DOOR':
        summary.collectedReservations++
        summary.collectedTickets += ticketCount
        summary.revenue += reservation.totalPrice
        break
      case 'PENDING_COLLECTION':
        summary.pendingReservations++
        summary.pendingTickets += ticketCount
        summary.pendingRevenue += reservation.totalPrice
        break
      case 'CANCELLED_BY_CUSTOMER':
      case 'CANCELLED_BY_ADMIN':
      case 'NO_SHOW':
      case 'EXPIRED':
        summary.cancelledReservations++
        summary.cancelledTickets += ticketCount
        break
    }
  }

  return summary
}

/**
 * Validate reservation request against performance capacity
 */
export async function validateReservationRequest(
  performanceId: string,
  ticketCounts: Record<string, number>,
): Promise<{
  isValid: boolean
  errors: string[]
  totalPrice: number
  ticketDetails: Array<{
    ticketTypeId: string
    name: string
    quantity: number
    pricePerItem: number
    totalPrice: number
  }>
}> {
  const errors: string[] = []
  let totalPrice = 0
  const ticketDetails: Array<{
    ticketTypeId: string
    name: string
    quantity: number
    pricePerItem: number
    totalPrice: number
  }> = []

  // Check performance exists and is bookable
  const performance = await prisma.performance.findUnique({
    where: { id: performanceId },
    select: {
      id: true,
      maxCapacity: true,
      showId: true,
      show: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  })

  if (!performance) {
    errors.push('Performance not found')
    return { isValid: false, errors, totalPrice: 0, ticketDetails: [] }
  }

  if (performance.show?.status !== 'PUBLISHED') {
    errors.push('This show is not available for booking')
  }

  // Check capacity
  const totalRequested = Object.values(ticketCounts).reduce((sum, count) => sum + count, 0)
  if (totalRequested <= 0) {
    errors.push('At least one ticket must be requested')
  }

  const reservedTickets = await prisma.reservedTicket.aggregate({
    where: {
      reservation: {
        performanceId,
        status: {
          notIn: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN', 'NO_SHOW', 'EXPIRED'],
        },
      },
    },
    _sum: {
      quantity: true,
    },
  })

  const currentReserved = reservedTickets._sum.quantity || 0
  const availableCapacity = performance.maxCapacity === -1 ? Number.MAX_SAFE_INTEGER : performance.maxCapacity - currentReserved

  if (performance.maxCapacity !== -1 && totalRequested > availableCapacity) {
    errors.push(`Only ${availableCapacity} tickets are available`)
  }

  // Validate ticket types and calculate pricing
  for (const [ticketTypeId, quantity] of Object.entries(ticketCounts)) {
    if (quantity <= 0) continue

    const ticketType = await prisma.ticketType.findUnique({
      where: { id: ticketTypeId },
      select: {
        id: true,
        name: true,
        defaultPrice: true,
        isActive: true,
      },
    })

    if (!ticketType || !ticketType.isActive) {
      errors.push(`Invalid ticket type: ${ticketTypeId}`)
      continue
    }

    // Get effective price
    const performancePrice = await prisma.performanceTicketPrice.findFirst({
      where: { performanceId, ticketTypeId, isActive: true },
    })

    let pricePerItem = ticketType.defaultPrice
    if (performancePrice) {
      pricePerItem = performancePrice.price
    }
    else if (performance.showId) {
      const showPrice = await prisma.showTicketPrice.findFirst({
        where: { showId: performance.showId, ticketTypeId, isActive: true },
      })
      if (showPrice) {
        pricePerItem = showPrice.price
      }
    }

    const itemTotal = pricePerItem * quantity
    totalPrice += itemTotal

    ticketDetails.push({
      ticketTypeId,
      name: ticketType.name,
      quantity,
      pricePerItem,
      totalPrice: itemTotal,
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalPrice,
    ticketDetails,
  }
}
