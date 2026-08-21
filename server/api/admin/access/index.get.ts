import { db, schema } from '@nuxthub/db'
import { asc, eq, ne, sql } from 'drizzle-orm'
import { verifyAccess } from '~~/shared/utils/abilities'

/** GET /api/admin/access — profiles to verify, waiting ones first. */
export default defineEventHandler(async (event) => {
  await authorize(event, verifyAccess)

  return db.select({
    userId: schema.accessProfiles.userId,
    name: schema.users.name,
    email: schema.users.email,
    status: schema.accessProfiles.status,
    accessCardNumber: schema.accessProfiles.accessCardNumber,
    difficultyStanding: schema.accessProfiles.difficultyStanding,
    difficultyWithCrowds: schema.accessProfiles.difficultyWithCrowds,
    levelAccess: schema.accessProfiles.levelAccess,
    distance: schema.accessProfiles.distance,
    urgentToilet: schema.accessProfiles.urgentToilet,
    visualInformation: schema.accessProfiles.visualInformation,
    audibleInformation: schema.accessProfiles.audibleInformation,
    miscellaneous: schema.accessProfiles.miscellaneous,
    companions: schema.accessProfiles.companions,
    fohNote: schema.accessProfiles.fohNote,
    consentFohAt: schema.accessProfiles.consentFohAt,
    verifiedAt: schema.accessProfiles.verifiedAt,
    expiresAt: schema.accessProfiles.expiresAt,
    updatedAt: schema.accessProfiles.updatedAt,
  })
    .from(schema.accessProfiles)
    .innerJoin(schema.users, eq(schema.accessProfiles.userId, schema.users.id))
    // Withdrawn tombstones carry nothing and are nobody's work.
    .where(ne(schema.accessProfiles.status, 'WITHDRAWN'))
    .orderBy(sql`case when ${schema.accessProfiles.status} = 'PENDING' then 0 else 1 end`, asc(schema.accessProfiles.updatedAt))
})
