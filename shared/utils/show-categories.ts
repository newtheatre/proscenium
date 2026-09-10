import { z } from 'zod'

// A show's category: the vocabulary a listing groups and filters by.

export const MAX_CATEGORY_NAME = 80

export const showCategoryForm = z.object({
  name: z.string().trim().min(1, 'A category needs a name').max(MAX_CATEGORY_NAME),
  sort: z.number().int().default(0),
}).strict()

export const archiveShowCategoryForm = z.object({ archived: z.boolean() }).strict()

export type ShowCategoryInput = z.output<typeof showCategoryForm>

export interface AdminShowCategory {
  id: string
  name: string
  sort: number
  archived: boolean
  // Counted from `shows.category_id`, never stored (D-131 criterion 4).
  inUse: boolean
}
