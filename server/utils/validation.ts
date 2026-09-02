import { z } from 'zod'
import type { H3Event } from 'h3'
import type { ZodType } from 'zod'

// A query string carries text, and `z.coerce.boolean()` reads "false" as true, so a flag written
// that way is on however it is set. Anything but a plain yes is no.
export const yesOrNo = z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform(value => value === true || value === 'true' || value === '1')

// Every request body and query string is validated (CONTRIBUTING). Failures are a 400 with the
// field paths and never the offending values, which may be a password.
export async function readValidatedBodyOrThrow<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  const result = schema.safeParse(await readBody(event).catch(() => undefined))
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid request: ${result.error.issues.map(issue => issue.path.join('.') || 'body').join(', ')}`,
    })
  }
  return result.data
}

// The query string gets the same treatment as the body: nothing reaches a handler unvalidated.
export async function getValidatedQueryOrThrow<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  const result = schema.safeParse(getQuery(event))
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid request: ${result.error.issues.map(issue => issue.path.join('.') || 'query').join(', ')}`,
    })
  }
  return result.data
}
