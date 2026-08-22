import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { verifyAccess } from '~~/shared/utils/abilities'

// Optional, so the form need not send symbols it does not offer; anything
// absent keeps whatever the person asked for.
const needs = Object.fromEntries(
  schema.ACCESS_NEEDS.map(key => [key, z.boolean().optional()]),
) as Record<(typeof schema.ACCESS_NEEDS)[number], z.ZodOptional<z.ZodBoolean>>

/** Three years, matching the Access Card's own cycle (docs/12 §2.3). */
const DEFAULT_VALIDITY_YEARS = 3

const bodySchema = z.object({
  ...needs,
  companions: z.coerce.number().int().min(0).max(2),
  /** Agreed wording, so the person it describes gets no surprises. */
  fohNote: z.string().trim().max(400).nullable().optional(),
  status: z.enum(['VERIFIED', 'DECLINED']),
  /** Where a card was sighted, its expiry wins over the default. */
  expiresAt: z.string().datetime().nullable().optional(),
})

/** PUT /api/admin/access/:userId. Record the conclusion of a conversation. */
export default defineEventHandler(async (event) => {
  await authorize(event, verifyAccess)

  const userId = getRouterParam(event, 'userId')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'User ID is required' })

  const input = await readValidatedBody(event, bodySchema.parse)
  const { user: verifier } = await requireUserSession(event)

  const existing = await db.select().from(schema.accessProfiles)
    .where(eq(schema.accessProfiles.userId, userId)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'No access profile for that account' })
  if (existing.status === 'WITHDRAWN') {
    throw createError({ statusCode: 409, statusMessage: 'That profile was withdrawn. It is not yours to reinstate.' })
  }

  const expires = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(new Date().setFullYear(new Date().getFullYear() + DEFAULT_VALIDITY_YEARS))

  const symbols = Object.fromEntries(
    schema.ACCESS_NEEDS.map(key => [key, input[key] ?? existing[key]]),
  )

  const [row] = await db.update(schema.accessProfiles).set({
    ...symbols,
    companions: input.companions,
    fohNote: input.fohNote ?? null,
    status: input.status,
    verifiedByUserId: verifier.id,
    verifiedAt: new Date(),
    expiresAt: input.status === 'VERIFIED' ? expires : null,
  }).where(eq(schema.accessProfiles.userId, userId)).returning()

  const person = await db.select({ name: schema.users.name, email: schema.users.email, anonymisedAt: schema.users.anonymisedAt })
    .from(schema.users).where(eq(schema.users.id, userId)).get()

  if (person && !person.anonymisedAt) {
    event.waitUntil(sendAccessDecisionEmail({
      to: person.email,
      name: person.name,
      verified: input.status === 'VERIFIED',
      needs: schema.ACCESS_NEEDS.filter(key => symbols[key]),
      companions: input.companions,
      fohNote: input.fohNote ?? null,
      expiresAt: input.status === 'VERIFIED' ? expires : null,
    }).catch((error: unknown) => console.error('[access] decision email failed:', error)))
  }

  return row
})
