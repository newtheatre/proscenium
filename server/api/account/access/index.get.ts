import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

/** GET /api/account/access: your own access profile, or null. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Everything here is visible *to* the person it describes, including the
  // staff note: it is written with them, so it holds no surprises (docs/12 §2.3).
  return db.select({
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
    requesterNote: schema.accessProfiles.requesterNote,
    fohNote: schema.accessProfiles.fohNote,
    consentFohAt: schema.accessProfiles.consentFohAt,
    verifiedAt: schema.accessProfiles.verifiedAt,
    expiresAt: schema.accessProfiles.expiresAt,
  }).from(schema.accessProfiles).where(eq(schema.accessProfiles.userId, user.id)).get() ?? null
})
