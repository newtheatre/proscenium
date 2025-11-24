import prisma from '~~/server/database'
import type { Prisma } from '~~/prisma/generated/client'
import { dbErrors } from './index'

/**
 * Standardised performance selection for consistent data across endpoints
 */
export const performanceSelectQuery = {
  id: true,
  title: true,
  startDateTime: true,
  runtimeMinutes: true,
  intervalMinutes: true,
  type: true,
  details: true,
  maxCapacity: true,
  reservationInstructions: true,
  externalBookingLink: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
  showId: true,
  venueId: true,
} satisfies Prisma.PerformanceSelect

/**
 * Performance selection with relations
 */
export const performanceWithRelationsSelectQuery = {
  ...performanceSelectQuery,
  show: {
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      status: true,
      showType: true,
      posterImageUrl: true,
      ageRating: true,
    },
  },
  venue: {
    select: {
      id: true,
      name: true,
      address: true,
      capacity: true,
    },
  },
  ticketPrices: {
    select: {
      id: true,
      price: true,
      notes: true,
      ticketType: {
        select: {
          id: true,
          name: true,
          description: true,
          sortOrder: true,
        },
      },
    },
    where: { isActive: true },
    orderBy: {
      ticketType: {
        sortOrder: 'asc',
      },
    },
  },
  _count: {
    select: {
      reservations: {
        where: {
          status: {
            notIn: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN', 'NO_SHOW', 'EXPIRED'],
          },
        },
      },
    },
  },
} satisfies Prisma.PerformanceSelect

/**
 * Performance selection for public listing (without sensitive data)
 */
export const performancePublicSelectQuery = {
  id: true,
  title: true,
  startDateTime: true,
  runtimeMinutes: true,
  intervalMinutes: true,
  type: true,
  details: true,
  maxCapacity: true,
  reservationInstructions: true,
  externalBookingLink: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
  showId: true,
  venueId: true,
  show: {
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      status: true,
      showType: true,
      posterImageUrl: true,
      ageRating: true,
      contentWarnings: {
        select: {
          notes: true,
          contentWarning: {
            select: {
              id: true,
              name: true,
              description: true,
              icon: true,
            },
          },
        },
      },
    },
  },
  venue: {
    select: {
      id: true,
      name: true,
      address: true,
      capacity: true,
    },
  },
} satisfies Prisma.PerformanceSelect

/**
 * Types for performance data returned from database
 */
export type PerformanceWithRelationsRaw = Prisma.PerformanceGetPayload<{
  select: typeof performanceSelectQuery
}>

export type PerformanceWithFullRelationsRaw = Prisma.PerformanceGetPayload<{
  select: typeof performanceWithRelationsSelectQuery
}>

export type PerformancePublicRaw = Prisma.PerformanceGetPayload<{
  select: typeof performancePublicSelectQuery
}>

/**
 * Create a new performance
 */
export async function createPerformance(data: Prisma.PerformanceCreateInput): Promise<PerformanceWithRelationsRaw> {
  const performance = await prisma.performance.create({
    data,
    select: performanceSelectQuery,
  })

  return performance
}

/**
 * Get all performances with optional filtering
 */
export async function getPerformances(filters?: {
  showId?: string
  venueId?: string
  type?: Prisma.EnumPerformanceTypeFilter
  startDate?: Date
  endDate?: Date
  isActive?: boolean
  includeRelations?: boolean
  publicOnly?: boolean
  limit?: number
  offset?: number
}): Promise<PerformanceWithRelationsRaw[] | PerformanceWithFullRelationsRaw[] | PerformancePublicRaw[]> {
  const where: Prisma.PerformanceWhereInput = {}

  if (filters?.showId) {
    where.showId = filters.showId
  }

  if (filters?.venueId) {
    where.venueId = filters.venueId
  }

  if (filters?.type) {
    where.type = filters.type
  }

  if (filters?.startDate || filters?.endDate) {
    where.startDateTime = {}
    if (filters.startDate) {
      where.startDateTime.gte = filters.startDate
    }
    if (filters.endDate) {
      where.startDateTime.lte = filters.endDate
    }
  }

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive
  }

  // For public listings, only show published shows
  if (filters?.publicOnly) {
    where.show = {
      status: 'PUBLISHED',
      isActive: true,
    }
  }

  let selectQuery = performanceSelectQuery
  if (filters?.includeRelations) {
    selectQuery = performanceWithRelationsSelectQuery
  }
  if (filters?.publicOnly) {
    selectQuery = performancePublicSelectQuery
  }

  return await prisma.performance.findMany({
    where,
    select: selectQuery,
    orderBy: [
      { startDateTime: 'asc' },
    ],
    take: filters?.limit,
    skip: filters?.offset,
  })
}

/**
 * Get performance by ID
 */
export async function getPerformanceById(
  id: string,
  includeRelations = false,
  publicOnly = false,
): Promise<PerformanceWithRelationsRaw | PerformanceWithFullRelationsRaw | PerformancePublicRaw> {
  let selectQuery = performanceSelectQuery
  if (includeRelations) {
    selectQuery = performanceWithRelationsSelectQuery
  }
  if (publicOnly) {
    selectQuery = performancePublicSelectQuery
  }

  const where: Prisma.PerformanceWhereUniqueInput = { id }

  const performance = await prisma.performance.findUnique({
    where,
    select: selectQuery,
  })

  if (!performance) {
    throw dbErrors.notFound('Performance')
  }

  // For public access, ensure the show is published
  if (publicOnly) {
    const performanceWithShow = performance as PerformancePublicRaw
    if (performanceWithShow.show && performanceWithShow.show.status !== 'PUBLISHED') {
      throw dbErrors.notFound('Performance')
    }
  }

  return performance
}

/**
 * Update performance by ID
 */
export async function updatePerformance(
  id: string,
  data: Prisma.PerformanceUpdateInput,
): Promise<PerformanceWithRelationsRaw> {
  // Check if performance exists
  await getPerformanceById(id)

  const performance = await prisma.performance.update({
    where: { id },
    data,
    select: performanceSelectQuery,
  })

  return performance
}

/**
 * Delete performance by ID (soft delete)
 */
export async function deletePerformance(id: string): Promise<void> {
  await updatePerformance(id, { isActive: false })
}

/**
 * Get performances happening today
 */
export async function getPerformancesToday(): Promise<PerformanceWithFullRelationsRaw[]> {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return await getPerformances({
    startDate: today,
    endDate: tomorrow,
    isActive: true,
    includeRelations: true,
    publicOnly: true,
  }) as PerformanceWithFullRelationsRaw[]
}

/**
 * Get available capacity for a performance
 */
export async function getPerformanceAvailableCapacity(performanceId: string): Promise<{
  maxCapacity: number
  reservedCount: number
  availableCount: number
  isUnlimited: boolean
}> {
  const performance = await getPerformanceById(performanceId)

  // Calculate total reserved tickets (excluding cancelled/expired reservations)
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

  const reservedCount = reservedTickets._sum.quantity || 0
  const maxCapacity = performance.maxCapacity
  const isUnlimited = maxCapacity === -1

  return {
    maxCapacity,
    reservedCount,
    availableCount: isUnlimited ? Number.MAX_SAFE_INTEGER : maxCapacity - reservedCount,
    isUnlimited,
  }
}

/**
 * Check if performance has available capacity for given ticket quantities
 */
export async function checkPerformanceCapacity(
  performanceId: string,
  requestedTickets: Record<string, number>,
): Promise<{
  isAvailable: boolean
  totalRequested: number
  availableCount: number
}> {
  const totalRequested = Object.values(requestedTickets).reduce((sum, count) => sum + count, 0)
  const capacity = await getPerformanceAvailableCapacity(performanceId)

  return {
    isAvailable: capacity.isUnlimited || totalRequested <= capacity.availableCount,
    totalRequested,
    availableCount: capacity.availableCount,
  }
}

/**
 * Get available ticket types and prices for a performance
 */
export async function getPerformanceTicketPricing(performanceId: string): Promise<{
  ticketTypeId: string
  name: string
  description?: string
  price: number
  source: 'performance' | 'show' | 'default'
  priceId?: string
  available: boolean
}[]> {
  // Get all active ticket types
  const ticketTypes = await prisma.ticketType.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      defaultPrice: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: 'asc' },
  })

  // Get performance-specific prices
  const performancePrices = await prisma.performanceTicketPrice.findMany({
    where: { performanceId, isActive: true },
    select: {
      id: true,
      ticketTypeId: true,
      price: true,
    },
  })

  // Get show-level prices
  const performance = await prisma.performance.findUnique({
    where: { id: performanceId },
    select: { showId: true },
  })

  let showPrices: { id: string, ticketTypeId: string, price: number }[] = []
  if (performance?.showId) {
    showPrices = await prisma.showTicketPrice.findMany({
      where: { showId: performance.showId, isActive: true },
      select: {
        id: true,
        ticketTypeId: true,
        price: true,
      },
    })
  }

  // Build pricing information
  return ticketTypes.map((ticketType) => {
    // Check performance-specific price first
    const performancePrice = performancePrices.find(p => p.ticketTypeId === ticketType.id)
    if (performancePrice) {
      return {
        ticketTypeId: ticketType.id,
        name: ticketType.name,
        description: ticketType.description || undefined,
        price: performancePrice.price,
        source: 'performance' as const,
        priceId: performancePrice.id,
        available: true,
      }
    }

    // Check show-level price
    const showPrice = showPrices.find(p => p.ticketTypeId === ticketType.id)
    if (showPrice) {
      return {
        ticketTypeId: ticketType.id,
        name: ticketType.name,
        description: ticketType.description || undefined,
        price: showPrice.price,
        source: 'show' as const,
        priceId: showPrice.id,
        available: true,
      }
    }

    // Use default price
    return {
      ticketTypeId: ticketType.id,
      name: ticketType.name,
      description: ticketType.description || undefined,
      price: ticketType.defaultPrice,
      source: 'default' as const,
      available: true,
    }
  })
}
