// Checking a bar set-up form with the route's own schema (docs/kit/interface.md, "Checking a form").
// The bar's forms hold their values in the shape a person edits ('none' for no parent, a percentage
// beside its pricing), so each builds the body it will send and checks that: every problem lands on
// the UFormField named by its path, as the server's would ("sizes.1.name").
import type { z } from 'zod'

export interface FieldError { name: string, message: string }

/** The schema's problems with a body, one per field, worded from the catalogue. */
export function bodyErrors(schema: z.ZodType, body: unknown): FieldError[] {
  const checked = schema.safeParse(body)
  if (checked.success) return []
  const seen = new Set<string>()
  return checked.error.issues.flatMap((issue) => {
    const name = issue.path.map(String).join('.')
    if (seen.has(name)) return []
    seen.add(name)
    return [{ name, message: phrase(issue.message) ?? issue.message }]
  })
}
