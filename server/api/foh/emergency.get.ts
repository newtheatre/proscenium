import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({ performanceId: z.string().trim().min(1) })

/** GET /api/foh/emergency — the venue's emergency card for a performance. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const { performanceId } = await getValidatedQuery(event, querySchema.parse)
  scopedPerformance(scope, performanceId)

  const [row] = await db.select({
    venueName: schema.venues.name,
    venueAddress: schema.venues.address,
    addressForEmergencyCall: schema.venueEmergencyInfo.addressForEmergencyCall,
    what3words: schema.venueEmergencyInfo.what3words,
    evacuationProcedure: schema.venueEmergencyInfo.evacuationProcedure,
    assemblyPoint: schema.venueEmergencyInfo.assemblyPoint,
    firstAidLocation: schema.venueEmergencyInfo.firstAidLocation,
    defibrillatorLocation: schema.venueEmergencyInfo.defibrillatorLocation,
    isolationPoints: schema.venueEmergencyInfo.isolationPoints,
    firePanelLocation: schema.venueEmergencyInfo.firePanelLocation,
  })
    .from(schema.performances)
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .leftJoin(schema.venueEmergencyInfo, eq(schema.venueEmergencyInfo.venueId, schema.venues.id))
    .where(eq(schema.performances.id, performanceId))
    .limit(1)

  // A venue with no card still answers, so the page renders the address it does
  // have rather than an error. Nothing here is worth a failed request.
  return row ?? null
})
