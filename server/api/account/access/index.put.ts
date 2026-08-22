import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const needs = Object.fromEntries(
  schema.ACCESS_NEEDS.map(key => [key, z.boolean().optional()]),
) as Record<(typeof schema.ACCESS_NEEDS)[number], z.ZodOptional<z.ZodBoolean>>

const bodySchema = z.object({
  ...needs,
  companions: z.coerce.number().int().min(0).max(2).optional(),
  accessCardNumber: z.string().trim().max(60).nullable().optional(),
  /** Free text, for what they need rather than why. Never shown to the door. */
  requesterNote: z.string().trim().max(1000).nullable().optional(),
  /**
   * Explicit, and the lawful basis for the whole feature. False withdraws it
   * without deleting the profile (UK GDPR Art 9(2)(a), ADR-0022).
   */
  consentFoh: z.boolean(),
})

/** PUT /api/account/access: ask for verification, or update what you asked for. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const input = await readValidatedBody(event, bodySchema.parse)

  const existing = await db.select().from(schema.accessProfiles)
    .where(eq(schema.accessProfiles.userId, user.id)).get()

  if (existing?.status === 'WITHDRAWN') {
    throw createError({
      statusCode: 409,
      statusMessage: 'That profile was removed. Ask the front-of-house manager to start a new one.',
    })
  }

  const symbols = Object.fromEntries(
    schema.ACCESS_NEEDS.map(key => [key, input[key] ?? existing?.[key] ?? false]),
  )

  const values = {
    ...symbols,
    userId: user.id,
    companions: input.companions ?? existing?.companions ?? 0,
    accessCardNumber: input.accessCardNumber === undefined
      ? existing?.accessCardNumber ?? null
      : input.accessCardNumber,
    requesterNote: input.requesterNote === undefined
      ? existing?.requesterNote ?? null
      : input.requesterNote,
    consentFohAt: input.consentFoh ? existing?.consentFohAt ?? new Date() : null,
    // Any change re-opens verification: what the door is told must be what a
    // human agreed, not what somebody last ticked.
    status: 'PENDING' as const,
    verifiedByUserId: null,
    verifiedAt: null,
  }

  const [row] = existing
    ? await db.update(schema.accessProfiles).set(values)
        .where(eq(schema.accessProfiles.userId, user.id)).returning()
    : await db.insert(schema.accessProfiles).values(values).returning()

  if (!existing) {
    event.waitUntil(sendAccessRequestEmail({ name: user.name })
      .catch((error: unknown) => console.error('[access] request notice failed:', error)))
  }

  return row
})
