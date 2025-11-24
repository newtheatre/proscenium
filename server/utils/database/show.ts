import prisma from '~~/server/database'
import type { Prisma } from '~~/prisma/generated/client'
import { dbErrors } from './index'

/**
 * Standardised show selection for consistent data across endpoints
 */
export const showSelectQuery = {
  id: true,
  title: true,
  slug: true,
  description: true,
  status: true,
  showType: true,
  posterImageUrl: true,
  programmeUrl: true,
  ageRating: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
} satisfies Prisma.ShowSelect

/**
 * Show selection with relations
 */
export const showWithRelationsSelectQuery = {
  ...showSelectQuery,
  induction: {
    select: {
      id: true,
      technicalRequirements: true,
      riskAssessmentCompleted: true,
      riskAssessmentLink: true,
      companyContactName: true,
      companyContactEmail: true,
      companyContactPhone: true,
      inductionNotes: true,
      inductionCompleted: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  contentWarnings: {
    select: {
      notes: true,
      createdAt: true,
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
  performances: {
    select: {
      id: true,
      title: true,
      startDateTime: true,
      runtimeMinutes: true,
      intervalMinutes: true,
    },
    where: { isActive: true },
    orderBy: { startDateTime: 'asc' },
  },
  showTicketPrices: {
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
} satisfies Prisma.ShowSelect

/**
 * Show induction selection
 */
export const showInductionSelectQuery = {
  id: true,
  technicalRequirements: true,
  riskAssessmentCompleted: true,
  riskAssessmentLink: true,
  companyContactName: true,
  companyContactEmail: true,
  companyContactPhone: true,
  inductionNotes: true,
  inductionCompleted: true,
  showId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShowInductionSelect

/**
 * Types for show data returned from database
 */
export type ShowWithRelationsRaw = Prisma.ShowGetPayload<{
  select: typeof showSelectQuery
}>

export type ShowWithFullRelationsRaw = Prisma.ShowGetPayload<{
  select: typeof showWithRelationsSelectQuery
}>

export type ShowInductionWithRelationsRaw = Prisma.ShowInductionGetPayload<{
  select: typeof showInductionSelectQuery
}>

/**
 * Create a new show
 */
export async function createShow(data: Prisma.ShowCreateInput): Promise<ShowWithRelationsRaw> {
  // Check if slug already exists
  const existing = await prisma.show.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  })

  if (existing) {
    throw dbErrors.conflict('A show with this slug already exists')
  }

  const show = await prisma.show.create({
    data,
    select: showSelectQuery,
  })

  return show
}

/**
 * Get all shows with optional filtering
 */
export async function getShows(filters?: {
  status?: Prisma.EnumShowStatusFilter
  showType?: Prisma.EnumShowTypeFilter
  isActive?: boolean
  includeRelations?: boolean
  limit?: number
  offset?: number
}): Promise<ShowWithRelationsRaw[] | ShowWithFullRelationsRaw[]> {
  const where: Prisma.ShowWhereInput = {}

  if (filters?.status) {
    where.status = filters.status
  }

  if (filters?.showType) {
    where.showType = filters.showType
  }

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive
  }

  const selectQuery = filters?.includeRelations ? showWithRelationsSelectQuery : showSelectQuery

  return await prisma.show.findMany({
    where,
    select: selectQuery,
    orderBy: [
      { createdAt: 'desc' },
    ],
    take: filters?.limit,
    skip: filters?.offset,
  })
}

/**
 * Get show by ID
 */
export async function getShowById(
  id: string,
  includeRelations = false,
): Promise<ShowWithRelationsRaw | ShowWithFullRelationsRaw> {
  const selectQuery = includeRelations ? showWithRelationsSelectQuery : showSelectQuery

  const show = await prisma.show.findUnique({
    where: { id },
    select: selectQuery,
  })

  if (!show) {
    throw dbErrors.notFound('Show')
  }

  return show
}

/**
 * Get show by slug
 */
export async function getShowBySlug(
  slug: string,
  includeRelations = false,
): Promise<ShowWithRelationsRaw | ShowWithFullRelationsRaw> {
  const selectQuery = includeRelations ? showWithRelationsSelectQuery : showSelectQuery

  const show = await prisma.show.findUnique({
    where: { slug },
    select: selectQuery,
  })

  if (!show) {
    throw dbErrors.notFound('Show')
  }

  return show
}

/**
 * Update show by ID
 */
export async function updateShow(
  id: string,
  data: Prisma.ShowUpdateInput,
): Promise<ShowWithRelationsRaw> {
  // Check if show exists
  await getShowById(id)

  // If updating slug, check for conflicts
  if (data.slug && typeof data.slug === 'string') {
    const slugConflict = await prisma.show.findFirst({
      where: {
        slug: data.slug,
        id: { not: id },
      },
      select: { id: true },
    })

    if (slugConflict) {
      throw dbErrors.conflict('A show with this slug already exists')
    }
  }

  const show = await prisma.show.update({
    where: { id },
    data,
    select: showSelectQuery,
  })

  return show
}

/**
 * Delete show by ID (soft delete)
 */
export async function deleteShow(id: string): Promise<void> {
  await updateShow(id, { isActive: false })
}

/**
 * Publish show
 */
export async function publishShow(id: string): Promise<ShowWithRelationsRaw> {
  return await updateShow(id, { status: 'PUBLISHED' })
}

/**
 * Create show induction
 */
export async function createShowInduction(
  data: Prisma.ShowInductionCreateInput,
): Promise<ShowInductionWithRelationsRaw> {
  const showInduction = await prisma.showInduction.create({
    data,
    select: showInductionSelectQuery,
  })

  return showInduction
}

/**
 * Get show induction by show ID
 */
export async function getShowInductionByShowId(showId: string): Promise<ShowInductionWithRelationsRaw | null> {
  return await prisma.showInduction.findUnique({
    where: { showId },
    select: showInductionSelectQuery,
  })
}

/**
 * Update show induction by show ID
 */
export async function updateShowInduction(
  showId: string,
  data: Prisma.ShowInductionUpdateInput,
): Promise<ShowInductionWithRelationsRaw> {
  const showInduction = await prisma.showInduction.update({
    where: { showId },
    data,
    select: showInductionSelectQuery,
  })

  return showInduction
}

/**
 * Upsert show induction (create or update)
 */
export async function upsertShowInduction(
  showId: string,
  data: Prisma.ShowInductionUpdateInput,
): Promise<ShowInductionWithRelationsRaw> {
  const showInduction = await prisma.showInduction.upsert({
    where: { showId },
    create: {
      showId,
      technicalRequirements: data.technicalRequirements as string,
      riskAssessmentCompleted: data.riskAssessmentCompleted as boolean,
      riskAssessmentLink: data.riskAssessmentLink as string,
      companyContactName: data.companyContactName as string,
      companyContactEmail: data.companyContactEmail as string,
      companyContactPhone: data.companyContactPhone as string,
      inductionNotes: data.inductionNotes as string,
      inductionCompleted: data.inductionCompleted as boolean,
    },
    update: data,
    select: showInductionSelectQuery,
  })

  return showInduction
}
