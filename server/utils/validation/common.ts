import { z } from 'zod'

/**
 * Common validation schemas and helpers
 */

/**
 * Email validation schema
 */
export const emailSchema = z.string().email('Invalid email address')

/**
 * Password validation schema
 */
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters')

/**
 * Name validation schema
 */
export const nameSchema = z.string().min(1, 'Name is required').max(100, 'Name too long')

/**
 * Validation helper for pagination
 */
export function validatePagination(query: Record<string, unknown>): { page: number, limit: number, skip: number } {
  const page = Math.max(1, Number.parseInt(query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit as string) || 10))

  if (Number.isNaN(page) || Number.isNaN(limit)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid pagination parameters. Page and limit must be valid numbers.',
    })
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  }
}

/**
 * Validation helper for sorting
 */
export function validateSort(query: Record<string, unknown>, validFields: string[]): { sortBy: string, sortOrder: 'asc' | 'desc' } {
  const sortBy = (query.sortBy as string) || 'createdAt'
  const sortOrder = (query.sortOrder as string) === 'asc' ? 'asc' : 'desc'

  if (!validFields.includes(sortBy)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid sortBy field. Must be one of: ${validFields.join(', ')}`,
    })
  }

  return { sortBy, sortOrder }
}
