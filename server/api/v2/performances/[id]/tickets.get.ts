import prisma from '~~/server/database'

// GET /api/v2/performances/[id]/tickets
//
// Returns ticket availability and pricing for a specific performance
export default defineEventHandler(async (event) => {
  const performanceId = getRouterParam(event, 'id')

  if (!performanceId) {
    throw createError({
      statusCode: 400,
      message: 'Performance ID is required',
    })
  }

  // Verify the performance exists, is active, and get its show ID
  const performance = await prisma.performance.findUnique({
    where: {
      id: performanceId,
      isActive: true,
    },
    select: {
      id: true,
      showId: true,
      maxCapacity: true,
      show: {
        select: {
          status: true,
        },
      },
    },
  })

  if (!performance) {
    throw createError({
      statusCode: 404,
      message: 'Performance not found',
    })
  }

  // Check if show is published (if linked to a show)
  if (performance.show && performance.show.status !== 'PUBLISHED') {
    throw createError({
      statusCode: 404,
      message: 'Performance not available',
    })
  }

  // Calculate availability
  const reservationStats = await prisma.reservedTicket.aggregate({
    where: {
      reservation: {
        performanceId,
        status: { notIn: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN'] },
      },
    },
    _sum: {
      quantity: true,
    },
  })

  const totalSold = reservationStats._sum.quantity ?? 0
  const isUnlimited = performance.maxCapacity === -1
  const remainingCapacity = isUnlimited ? 9999 : Math.max(0, performance.maxCapacity - totalSold)
  const isSoldOut = !isUnlimited && remainingCapacity <= 0

  // Get all active ticket types
  const allTicketTypes = await prisma.ticketType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      defaultPrice: true,
      sortOrder: true,
    },
  })

  // Get performance-specific prices
  const performancePrices = await prisma.performanceTicketPrice.findMany({
    where: {
      performanceId,
      isActive: true,
    },
    select: {
      ticketTypeId: true,
      price: true,
      notes: true,
    },
  })

  // Get show-level prices if performance has a show
  const showPrices = performance.showId
    ? await prisma.showTicketPrice.findMany({
        where: {
          showId: performance.showId,
          isActive: true,
        },
        select: {
          ticketTypeId: true,
          price: true,
          notes: true,
        },
      })
    : []

  // Create lookup maps for efficient access
  const performancePriceMap = new Map(
    performancePrices.map(p => [p.ticketTypeId, p]),
  )
  const showPriceMap = new Map(
    showPrices.map(p => [p.ticketTypeId, p]),
  )

  // Build the response with correct pricing hierarchy
  const ticketTypes = allTicketTypes.map((ticketType) => {
    const performancePrice = performancePriceMap.get(ticketType.id)
    const showPrice = showPriceMap.get(ticketType.id)

    // Priority: performance price > show price > default price
    const price = performancePrice?.price ?? showPrice?.price ?? ticketType.defaultPrice
    const notes = performancePrice?.notes ?? showPrice?.notes ?? null
    const priceSource = performancePrice ? 'performance' : showPrice ? 'show' : 'default'

    return {
      id: ticketType.id,
      name: ticketType.name,
      description: ticketType.description,
      price,
      notes,
      priceSource,
    }
  })

  return {
    performance: {
      id: performance.id,
    },
    availability: {
      total: performance.maxCapacity,
      sold: totalSold,
      remaining: remainingCapacity,
      isSoldOut,
      isUnlimited,
    },
    ticketTypes,
  }
})
