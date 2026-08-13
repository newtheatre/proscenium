import { db, schema } from '@nuxthub/db'
import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import { managePassTypes } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens'),
  description: z.string().optional().nullable(),
  seasonId: z.string().optional().nullable(),
  validFrom: z.string().min(1),
  validTo: z.string().min(1),
  maxIssued: z.int().min(1).optional().nullable(),
  transferable: z.boolean().optional().default(false),
  prices: z.array(z.object({
    label: z.string().min(1),
    price: z.int().min(0),
  })).min(1, 'A pass needs at least one price'),
  /** Explicit show scope. Omit and pass seedFromSeason to fill it from a season. */
  showIds: z.array(z.string()).optional(),
  /** Seed the scope with every show in this season. */
  seedFromSeason: z.string().optional().nullable(),
})

/** POST /api/pass-types — create a pass product. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  await authorize(event, managePassTypes)

  const body = await readValidatedBody(event, bodySchema.parse)

  // Whole days in Europe/London, not UTC midnights — see validityWindow.ts.
  // Stored as instants so `canRedeem` can compare them to a performance's
  // startsAt directly.
  const validFrom = validityStart(body.validFrom)
  const validTo = validityEnd(body.validTo)
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'validFrom and validTo must be valid dates' })
  }
  if (validTo < validFrom) {
    throw createError({ statusCode: 400, statusMessage: 'validTo must be on or after validFrom' })
  }

  const clash = await db.select({ id: schema.passTypes.id })
    .from(schema.passTypes).where(eq(schema.passTypes.slug, body.slug)).get()
  if (clash) throw createError({ statusCode: 400, statusMessage: 'A pass type with that slug already exists' })

  // Resolve the show scope up front so the whole product lands in one batch.
  let showIds = body.showIds ?? []
  if (body.seedFromSeason) {
    const seasonShows = await db.select({ id: schema.shows.id })
      .from(schema.shows).where(eq(schema.shows.seasonId, body.seedFromSeason))
    showIds = [...new Set([...showIds, ...seasonShows.map(s => s.id)])]
  }
  if (showIds.length > 0) {
    const found = await db.select({ id: schema.shows.id })
      .from(schema.shows).where(inArray(schema.shows.id, showIds))
    if (found.length !== showIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'One or more shows in the scope do not exist' })
    }
  }

  const passTypeId = nanoid()
  const typeInsert = db.insert(schema.passTypes).values({
    id: passTypeId,
    name: body.name,
    slug: body.slug,
    description: body.description ?? null,
    seasonId: body.seasonId || null,
    status: 'DRAFT',
    validFrom,
    validTo,
    maxIssued: body.maxIssued ?? null,
    transferable: body.transferable ?? false,
  })
  const pricesInsert = db.insert(schema.passTypePrices).values(
    body.prices.map((p, i) => ({ passTypeId, label: p.label, price: p.price, sort: i })),
  )

  // Atomic: a pass product with no prices, or with prices but no scope, is not
  // a usable half-state to leave lying around.
  if (showIds.length > 0) {
    await db.batch([
      typeInsert,
      pricesInsert,
      db.insert(schema.passTypeShows).values(showIds.map(showId => ({ passTypeId, showId }))),
    ])
  }
  else {
    await db.batch([typeInsert, pricesInsert])
  }

  return { id: passTypeId, showCount: showIds.length }
})
