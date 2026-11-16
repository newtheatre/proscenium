import { z } from 'zod'

/** The form's rules, written once and used by the page and by the route. */
export const sampleSchema = z.object({
  name: z.string().min(3, 'Give a name of at least 3 characters.'),
  email: z.string().email('Give an email address such as name@example.org.'),
  quantity: z.number().int().min(1, 'Choose at least 1.').max(10, 'Choose 10 or fewer.'),
  notes: z.string().max(200, 'Keep notes to 200 characters.').optional(),
})
