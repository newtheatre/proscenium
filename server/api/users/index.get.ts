import prisma from '~~/lib/prisma'

/**
 * Returns a paginated, filterable, and sortable list of all user profiles.
 * (Admin only)
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'ADMIN')

  const query = getQuery(event)
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 10
  const sort = String(query.sort || 'createdAt')
  const order = String(query.order || 'desc') as 'asc' | 'desc'
  const filter = String(query.filter || '')
  const search = String(query.search || '')

  // Filter selects the field(s) to search, nested fields are supported using dot notation
  // Example: filter=roles&search=admin
  // You can search across multiple fields

  const filters = filter ? filter.split(',').map(f => f.trim()).filter(Boolean) : []
  const searchTerms = search.trim().toLowerCase().split(' ').filter(Boolean)
  const where: any = {}

  if (searchTerms.length > 0 && filters.length > 0) {
    where.OR = []
    searchTerms.forEach((term) => {
      filters.forEach((field) => {
        if (field === 'roles') {
          // Handle relation field - search in UserRole.role enum
          where.OR.push({
            roles: {
              some: {
                role: {
                  equals: term.toUpperCase(),
                },
              },
            },
          })
        }
        else if (field === 'membership') {
          // Handle membership type search
          where.OR.push({
            membership: {
              type: {
                equals: term.toUpperCase(),
              },
            },
          })
        }
        else if (field === 'profile.name') {
          // Handle nested profile name search
          where.OR.push({
            profile: {
              name: {
                contains: term,
                mode: 'insensitive',
              },
            },
          })
        }
        else if (field === 'profile.course') {
          // Handle nested profile course search
          where.OR.push({
            profile: {
              course: {
                contains: term,
                mode: 'insensitive',
              },
            },
          })
        }
        else {
          // Handle direct User fields (name, email, studentId, etc.)
          where.OR.push({
            [field]: {
              contains: term,
              mode: 'insensitive',
            },
          })
        }
      })
    })
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: {
      [sort]: order,
    },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      roles: {
        select: {
          role: true,
        },
      },
      membership: {
        select: {
          type: true,
          expiry: true,
        },
      },
      profile: {
        select: {
          name: true,
          bio: true,
          avatar: true,
          gradYear: true,
          course: true,
        },
      },
    },
  })

  const totalCount = await prisma.user.count({ where })

  const totalPages = Math.ceil(totalCount / limit)

  return {
    users,
    meta: {
      totalCount,
      totalPages,
      currentPage: page,
      pageSize: limit,
    },
  }
})
