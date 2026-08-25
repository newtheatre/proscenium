import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import { verifyAccess } from '~~/shared/utils/abilities'

const querySchema = paginationSchema.extend({
  /** The two lists the verifier works from: still waiting, or already recorded. */
  status: z.enum(['PENDING', 'SETTLED']).optional().default('PENDING'),
})

const needColumns = {
  difficultyStanding: schema.accessProfiles.difficultyStanding,
  difficultyWithCrowds: schema.accessProfiles.difficultyWithCrowds,
  levelAccess: schema.accessProfiles.levelAccess,
  distance: schema.accessProfiles.distance,
  urgentToilet: schema.accessProfiles.urgentToilet,
  visualInformation: schema.accessProfiles.visualInformation,
  audibleInformation: schema.accessProfiles.audibleInformation,
  miscellaneous: schema.accessProfiles.miscellaneous,
  companions: schema.accessProfiles.companions,
}

/** What the verification conversation needs, the person's own words included. */
const waitingColumns = {
  userId: schema.accessProfiles.userId,
  name: schema.users.name,
  email: schema.users.email,
  status: schema.accessProfiles.status,
  accessCardNumber: schema.accessProfiles.accessCardNumber,
  ...needColumns,
  requesterNote: schema.accessProfiles.requesterNote,
  fohNote: schema.accessProfiles.fohNote,
  consentFohAt: schema.accessProfiles.consentFohAt,
  verifiedAt: schema.accessProfiles.verifiedAt,
  expiresAt: schema.accessProfiles.expiresAt,
  updatedAt: schema.accessProfiles.updatedAt,
}

/** A recorded profile is nobody's outstanding work, so its notes are not sent (ADR-0022). */
const settledColumns = {
  userId: schema.accessProfiles.userId,
  name: schema.users.name,
  status: schema.accessProfiles.status,
  ...needColumns,
  expiresAt: schema.accessProfiles.expiresAt,
  updatedAt: schema.accessProfiles.updatedAt,
}

/** GET /api/admin/access: one page of profiles, waiting or already recorded. */
export default defineEventHandler(async (event) => {
  await authorize(event, verifyAccess)

  const query = await getValidatedQuery(event, querySchema.parse)
  const waiting = query.status === 'PENDING'

  const filters = [
    // Withdrawn tombstones carry nothing and are nobody's work.
    ne(schema.accessProfiles.status, 'WITHDRAWN'),
    waiting
      ? eq(schema.accessProfiles.status, 'PENDING')
      : ne(schema.accessProfiles.status, 'PENDING'),
  ]

  // Search identifies the person, never their words: requesterNote and fohNote
  // are the Article 9 fields (ADR-0022, ADR-0005).
  if (query.q) {
    filters.push(or(
      likeInsensitive(schema.users.name, query.q),
      likeInsensitive(schema.users.email, query.q),
    )!)
  }

  const where = and(...filters)
  const offset = offsetFor(query)

  const [rows, totals] = await Promise.all([
    waiting
      ? db.select(waitingColumns)
          .from(schema.accessProfiles)
          .innerJoin(schema.users, eq(schema.accessProfiles.userId, schema.users.id))
          .where(where)
          // Longest waiting first: the queue is worked from the top.
          .orderBy(asc(schema.accessProfiles.updatedAt))
          .limit(query.limit).offset(offset)
      : db.select(settledColumns)
          .from(schema.accessProfiles)
          .innerJoin(schema.users, eq(schema.accessProfiles.userId, schema.users.id))
          .where(where)
          // Most recently recorded first: the archive is read backwards.
          .orderBy(desc(schema.accessProfiles.updatedAt))
          .limit(query.limit).offset(offset),
    db.select({ value: count() })
      .from(schema.accessProfiles)
      .innerJoin(schema.users, eq(schema.accessProfiles.userId, schema.users.id))
      .where(where),
  ])

  return paginated(rows, totals[0]?.value ?? 0, query)
})
