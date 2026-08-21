import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { manageFohReference } from '~~/shared/utils/abilities'

/** GET /api/admin/foh/emergency — every venue's emergency card, for editing. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageFohReference)

  return db.select({
    venueId: schema.venues.id,
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
    updatedAt: schema.venueEmergencyInfo.updatedAt,
  })
    .from(schema.venues)
    .leftJoin(schema.venueEmergencyInfo, eq(schema.venueEmergencyInfo.venueId, schema.venues.id))
    .orderBy(asc(schema.venues.name))
})
