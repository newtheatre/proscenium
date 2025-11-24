import prisma from '~~/server/database'
import type { Prisma } from '~~/prisma/generated/client'
import { dbErrors } from './index'

/**
 * Query options for ticket type filtering and sorting
 */
export interface TicketTypeQueryOptions {
  search?: string
  isActive?: boolean
  minPrice?: number
  maxPrice?: number
  priceRange?: string
  sortBy?: 'name' | 'defaultPrice' | 'createdAt' | 'updatedAt' | 'sortOrder'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  skip?: number
  includeUsageStats?: boolean
}

/**
 * Standardised ticket type selection for consistent data across endpoints
 */
export const ticketTypeSelectQuery = {
  id: true,
  name: true,
  description: true,
  defaultPrice: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
} satisfies Prisma.TicketTypeSelect

/**
 * Detailed ticket type selection with relations for admin views
 */
export const ticketTypeDetailSelectQuery = {
  id: true,
  name: true,
  description: true,
  defaultPrice: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
  showPrices: {
    select: {
      id: true,
      price: true,
      notes: true,
      isActive: true,
      show: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
    },
  },
  performancePrices: {
    select: {
      id: true,
      price: true,
      notes: true,
      isActive: true,
      performance: {
        select: {
          id: true,
          startDateTime: true,
          runtimeMinutes: true,
          intervalMinutes: true,
          show: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TicketTypeSelect

/**
 * Type for detailed ticket type data with relations
 */
export type TicketTypeDetailWithRelationsRaw = Prisma.TicketTypeGetPayload<{
  select: typeof ticketTypeDetailSelectQuery
}>

/**
 * Show ticket price selection with relations
 */
export const showTicketPriceSelectQuery = {
  id: true,
  price: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
  showId: true,
  ticketTypeId: true,
  ticketType: {
    select: ticketTypeSelectQuery,
  },
} satisfies Prisma.ShowTicketPriceSelect

/**
 * Performance ticket price selection with relations
 */
export const performanceTicketPriceSelectQuery = {
  id: true,
  price: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
  performanceId: true,
  ticketTypeId: true,
  ticketType: {
    select: ticketTypeSelectQuery,
  },
} satisfies Prisma.PerformanceTicketPriceSelect

/**
 * Reserved ticket selection with relations
 */
export const reservedTicketSelectQuery = {
  id: true,
  quantity: true,
  pricePerItemAtReservation: true,
  ticketTypeNameAtReservation: true,
  createdAt: true,
  updatedAt: true,
  ticketTypeId: true,
  reservationId: true,
  performanceTicketPriceId: true,
  showTicketPriceId: true,
  ticketType: {
    select: ticketTypeSelectQuery,
  },
} satisfies Prisma.ReservedTicketSelect

/**
 * Types for ticket data returned from database with relations
 */
export type TicketTypeWithRelationsRaw = Prisma.TicketTypeGetPayload<{
  select: typeof ticketTypeSelectQuery
}>

export type ShowTicketPriceWithRelationsRaw = Prisma.ShowTicketPriceGetPayload<{
  select: typeof showTicketPriceSelectQuery
}>

export type PerformanceTicketPriceWithRelationsRaw = Prisma.PerformanceTicketPriceGetPayload<{
  select: typeof performanceTicketPriceSelectQuery
}>

export type ReservedTicketWithRelationsRaw = Prisma.ReservedTicketGetPayload<{
  select: typeof reservedTicketSelectQuery
}>

/**
 * Create a new ticket type
 */
export async function createTicketType(data: Prisma.TicketTypeCreateInput): Promise<TicketTypeWithRelationsRaw> {
  // Check if name already exists
  const existing = await prisma.ticketType.findUnique({
    where: { name: data.name },
    select: { id: true },
  })

  if (existing) {
    throw dbErrors.conflict('A ticket type with this name already exists')
  }

  const ticketType = await prisma.ticketType.create({
    data,
    select: ticketTypeSelectQuery,
  })

  return ticketType
}

/**
 * Get all ticket types with optional filtering, sorting, and pagination
 */
export async function getTicketTypes(options: TicketTypeQueryOptions = {}): Promise<TicketTypeWithRelationsRaw[]> {
  const {
    search,
    isActive,
    minPrice,
    maxPrice,
    priceRange,
    sortBy = 'name',
    sortOrder = 'asc',
    limit,
    skip,
  } = options

  const where: Prisma.TicketTypeWhereInput = {}

  // Active status filter
  if (isActive !== undefined) {
    where.isActive = isActive
  }

  // Search filter
  if (search) {
    const searchConditions: Array<Record<string, unknown>> = [
      { name: { contains: search } },
      { description: { contains: search } },
    ]

    // If search term is a number, also search by price
    const searchAsNumber = parseFloat(search)
    if (!isNaN(searchAsNumber)) {
      searchConditions.push({ defaultPrice: searchAsNumber })
    }

    where.OR = searchConditions
  }

  // Price range filter (predefined ranges)
  if (priceRange) {
    if (priceRange === '0-5') {
      where.defaultPrice = { gte: 0, lte: 5 }
    }
    else if (priceRange === '5-10') {
      where.defaultPrice = { gte: 5, lte: 10 }
    }
    else if (priceRange === '10-15') {
      where.defaultPrice = { gte: 10, lte: 15 }
    }
    else if (priceRange === '15-20') {
      where.defaultPrice = { gte: 15, lte: 20 }
    }
    else if (priceRange === '20+') {
      where.defaultPrice = { gte: 20 }
    }
  }
  // Custom price range filter (min/max)
  else if (minPrice !== undefined || maxPrice !== undefined) {
    where.defaultPrice = {}
    if (minPrice !== undefined) {
      (where.defaultPrice as Record<string, unknown>).gte = minPrice
    }
    if (maxPrice !== undefined) {
      (where.defaultPrice as Record<string, unknown>).lte = maxPrice
    }
  }

  // Build orderBy clause
  const orderBy: Prisma.TicketTypeOrderByWithRelationInput[] = []

  if (sortBy === 'sortOrder') {
    // For sortOrder, use nulls last and secondary sort by name
    orderBy.push({ sortOrder: { sort: sortOrder, nulls: 'last' } })
    orderBy.push({ name: 'asc' })
  }
  else {
    orderBy.push({ [sortBy]: sortOrder })
  }

  return await prisma.ticketType.findMany({
    where,
    select: ticketTypeSelectQuery,
    orderBy,
    take: limit,
    skip,
  })
}

/**
 * Get paginated ticket types with total count
 */
export async function getTicketTypesWithCount(options: TicketTypeQueryOptions = {}): Promise<{
  ticketTypes: TicketTypeWithRelationsRaw[]
  total: number
}> {
  const {
    search,
    isActive,
    minPrice,
    maxPrice,
    priceRange,
  } = options

  const where: Prisma.TicketTypeWhereInput = {}

  // Active status filter
  if (isActive !== undefined) {
    where.isActive = isActive
  }

  // Search filter
  if (search) {
    const searchConditions: Array<Record<string, unknown>> = [
      { name: { contains: search } },
      { description: { contains: search } },
    ]

    // If search term is a number, also search by price
    const searchAsNumber = parseFloat(search)
    if (!isNaN(searchAsNumber)) {
      searchConditions.push({ defaultPrice: searchAsNumber })
    }

    where.OR = searchConditions
  }

  // Price range filter (predefined ranges)
  if (priceRange) {
    if (priceRange === '0-5') {
      where.defaultPrice = { gte: 0, lte: 5 }
    }
    else if (priceRange === '5-10') {
      where.defaultPrice = { gte: 5, lte: 10 }
    }
    else if (priceRange === '10-15') {
      where.defaultPrice = { gte: 10, lte: 15 }
    }
    else if (priceRange === '15-20') {
      where.defaultPrice = { gte: 15, lte: 20 }
    }
    else if (priceRange === '20+') {
      where.defaultPrice = { gte: 20 }
    }
  }
  // Custom price range filter (min/max)
  else if (minPrice !== undefined || maxPrice !== undefined) {
    where.defaultPrice = {}
    if (minPrice !== undefined) {
      (where.defaultPrice as Record<string, unknown>).gte = minPrice
    }
    if (maxPrice !== undefined) {
      (where.defaultPrice as Record<string, unknown>).lte = maxPrice
    }
  }

  const [ticketTypes, total] = await Promise.all([
    getTicketTypes(options),
    prisma.ticketType.count({ where }),
  ])

  return { ticketTypes, total }
}

/**
 * Get ticket type by ID with detailed relations (for admin detail views)
 */
export async function getTicketTypeByIdWithDetails(id: string): Promise<TicketTypeDetailWithRelationsRaw> {
  const ticketType = await prisma.ticketType.findUnique({
    where: { id },
    select: ticketTypeDetailSelectQuery,
  })

  if (!ticketType) {
    throw dbErrors.notFound('Ticket type')
  }

  return ticketType
}

/**
 * Get ticket type by ID
 */
export async function getTicketTypeById(id: string): Promise<TicketTypeWithRelationsRaw> {
  const ticketType = await prisma.ticketType.findUnique({
    where: { id },
    select: ticketTypeSelectQuery,
  })

  if (!ticketType) {
    throw dbErrors.notFound('Ticket type')
  }

  return ticketType
}

/**
 * Update ticket type by ID
 */
export async function updateTicketType(
  id: string,
  data: Prisma.TicketTypeUpdateInput,
): Promise<TicketTypeWithRelationsRaw> {
  // Check if ticket type exists
  await getTicketTypeById(id)

  // If updating name, check for conflicts
  if (data.name && typeof data.name === 'string') {
    const nameConflict = await prisma.ticketType.findFirst({
      where: {
        name: data.name,
        id: { not: id },
      },
      select: { id: true },
    })

    if (nameConflict) {
      throw dbErrors.conflict('A ticket type with this name already exists')
    }
  }

  const ticketType = await prisma.ticketType.update({
    where: { id },
    data,
    select: ticketTypeSelectQuery,
  })

  return ticketType
}

/**
 * Delete ticket type by ID (hard delete with usage check)
 */
export async function deleteTicketTypeById(id: string): Promise<void> {
  // Check if ticket type exists
  const existingTicketType = await prisma.ticketType.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          reservedTickets: true,
          showPrices: true,
          performancePrices: true,
        },
      },
    },
  })

  if (!existingTicketType) {
    throw dbErrors.notFound('Ticket type')
  }

  // Check if ticket type is in use
  if (existingTicketType._count.reservedTickets > 0) {
    throw dbErrors.conflict('Cannot delete ticket type: it is being used in reservations')
  }

  // Delete the ticket type and related prices in a transaction
  await prisma.$transaction([
    prisma.showTicketPrice.deleteMany({
      where: { ticketTypeId: id },
    }),
    prisma.performanceTicketPrice.deleteMany({
      where: { ticketTypeId: id },
    }),
    prisma.ticketType.delete({
      where: { id },
    }),
  ])
}

/**
 * Delete ticket type by ID (soft delete)
 */
export async function deleteTicketType(id: string): Promise<void> {
  await updateTicketType(id, { isActive: false })
}

/**
 * Create show ticket price
 */
export async function createShowTicketPrice(
  showId: string,
  ticketTypeId: string,
  price: number,
  notes?: string,
): Promise<ShowTicketPriceWithRelationsRaw> {
  // Check if price already exists for this show and ticket type combination
  const existing = await prisma.showTicketPrice.findUnique({
    where: {
      showId_ticketTypeId: {
        showId,
        ticketTypeId,
      },
    },
    select: { id: true },
  })

  if (existing) {
    throw dbErrors.conflict('A price for this ticket type already exists for this show')
  }

  const showTicketPrice = await prisma.showTicketPrice.create({
    data: {
      showId,
      ticketTypeId,
      price,
      notes,
    },
    select: showTicketPriceSelectQuery,
  })

  return showTicketPrice
}

/**
 * Get show ticket prices by show ID
 */
export async function getShowTicketPrices(showId: string): Promise<ShowTicketPriceWithRelationsRaw[]> {
  return await prisma.showTicketPrice.findMany({
    where: {
      showId,
      isActive: true,
    },
    select: showTicketPriceSelectQuery,
    orderBy: {
      ticketType: {
        sortOrder: 'asc',
      },
    },
  })
}

/**
 * Update show ticket price by ID
 */
export async function updateShowTicketPrice(
  id: string,
  data: Prisma.ShowTicketPriceUpdateInput,
): Promise<ShowTicketPriceWithRelationsRaw> {
  const showTicketPrice = await prisma.showTicketPrice.update({
    where: { id },
    data,
    select: showTicketPriceSelectQuery,
  })

  if (!showTicketPrice) {
    throw dbErrors.notFound('Show ticket price')
  }

  return showTicketPrice
}

/**
 * Delete show ticket price by ID
 */
export async function deleteShowTicketPrice(id: string): Promise<void> {
  await prisma.showTicketPrice.delete({
    where: { id },
  })
}

/**
 * Create performance ticket price
 */
export async function createPerformanceTicketPrice(
  performanceId: string,
  ticketTypeId: string,
  price: number,
  notes?: string,
): Promise<PerformanceTicketPriceWithRelationsRaw> {
  // Check if price already exists for this performance and ticket type combination
  const existing = await prisma.performanceTicketPrice.findUnique({
    where: {
      performanceId_ticketTypeId: {
        performanceId,
        ticketTypeId,
      },
    },
    select: { id: true },
  })

  if (existing) {
    throw dbErrors.conflict('A price for this ticket type already exists for this performance')
  }

  const performanceTicketPrice = await prisma.performanceTicketPrice.create({
    data: {
      performanceId,
      ticketTypeId,
      price,
      notes,
    },
    select: performanceTicketPriceSelectQuery,
  })

  return performanceTicketPrice
}

/**
 * Get performance ticket prices by performance ID
 */
export async function getPerformanceTicketPrices(
  performanceId: string,
): Promise<PerformanceTicketPriceWithRelationsRaw[]> {
  return await prisma.performanceTicketPrice.findMany({
    where: {
      performanceId,
      isActive: true,
    },
    select: performanceTicketPriceSelectQuery,
    orderBy: {
      ticketType: {
        sortOrder: 'asc',
      },
    },
  })
}

/**
 * Update performance ticket price by ID
 */
export async function updatePerformanceTicketPrice(
  id: string,
  data: Prisma.PerformanceTicketPriceUpdateInput,
): Promise<PerformanceTicketPriceWithRelationsRaw> {
  const performanceTicketPrice = await prisma.performanceTicketPrice.update({
    where: { id },
    data,
    select: performanceTicketPriceSelectQuery,
  })

  if (!performanceTicketPrice) {
    throw dbErrors.notFound('Performance ticket price')
  }

  return performanceTicketPrice
}

/**
 * Delete performance ticket price by ID
 */
export async function deletePerformanceTicketPrice(id: string): Promise<void> {
  await prisma.performanceTicketPrice.delete({
    where: { id },
  })
}

/**
 * Get effective ticket price for a performance
 * (checks performance-specific price first, then show price, then default price)
 */
export async function getEffectiveTicketPrice(
  performanceId: string,
  ticketTypeId: string,
): Promise<{
  price: number
  source: 'performance' | 'show' | 'default'
  priceId?: string
}> {
  // Check performance-specific price first
  const performancePrice = await prisma.performanceTicketPrice.findFirst({
    where: {
      performanceId,
      ticketTypeId,
      isActive: true,
    },
    select: {
      id: true,
      price: true,
    },
  })

  if (performancePrice) {
    return {
      price: performancePrice.price,
      source: 'performance',
      priceId: performancePrice.id,
    }
  }

  // Check show-level price
  const performance = await prisma.performance.findUnique({
    where: { id: performanceId },
    select: { showId: true },
  })

  if (performance?.showId) {
    const showPrice = await prisma.showTicketPrice.findFirst({
      where: {
        showId: performance.showId,
        ticketTypeId,
        isActive: true,
      },
      select: {
        id: true,
        price: true,
      },
    })

    if (showPrice) {
      return {
        price: showPrice.price,
        source: 'show',
        priceId: showPrice.id,
      }
    }
  }

  // Fall back to default ticket type price
  const ticketType = await prisma.ticketType.findUnique({
    where: { id: ticketTypeId },
    select: { defaultPrice: true },
  })

  if (!ticketType) {
    throw dbErrors.notFound('Ticket type')
  }

  return {
    price: ticketType.defaultPrice,
    source: 'default',
  }
}
