import { z } from 'zod'

// A list endpoint pages in SQL and answers with an envelope, never a bare array (CONTRIBUTING).
// This is the first, so it sets the shape every later list inherits.

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  pages: number
}

export function envelope<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
}

export function offsetFor(page: number, pageSize: number): number {
  return (page - 1) * pageSize
}
