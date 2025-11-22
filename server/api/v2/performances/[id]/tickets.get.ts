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

  // Verify the performance exists and get its show ID
  const performance = await prisma.performance.findUnique({
    where: { id: performanceId },
    select: {
      id: true,
      showId: true,
    },
  })

  if (!performance) {
    throw createError({
      statusCode: 404,
      message: 'Performance not found',
    })
  }

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
  const ticketPrices = allTicketTypes.map((ticketType) => {
    const performancePrice = performancePriceMap.get(ticketType.id)
    const showPrice = showPriceMap.get(ticketType.id)

    // Priority: performance price > show price > default price
    const price = performancePrice?.price ?? showPrice?.price ?? ticketType.defaultPrice
    const notes = performancePrice?.notes ?? showPrice?.notes ?? null
    const priceSource = performancePrice ? 'performance' : showPrice ? 'show' : 'default'

    return {
      ticketType: {
        id: ticketType.id,
        name: ticketType.name,
        description: ticketType.description,
        defaultPrice: ticketType.defaultPrice,
        sortOrder: ticketType.sortOrder,
      },
      price,
      notes,
      priceSource, // Helpful for debugging/understanding where the price comes from
    }
  })

  return ticketPrices
})
