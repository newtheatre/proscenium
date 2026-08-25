import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm'

/**
 * GET /api/backstage/emergency: tonight's emergency cards, **deliberately
 * public**: safety information is never behind a lock (ADR-0020, docs/11 §5.1).
 */
export default defineEventHandler(async () => {
  const night = showNightDate()

  // Allow-listed, and scoped to tonight's venues. Nothing about who is coming,
  // what was sold or who is working crosses this boundary.
  const cards = await db.selectDistinct({
    venueName: schema.venues.name,
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
    .where(and(
      gte(schema.performances.startsAt, validityStart(night)),
      lte(schema.performances.startsAt, validityEnd(night)),
      ne(schema.performances.status, 'CANCELLED'),
    ))
    .orderBy(asc(schema.venues.name))

  // The night travels with the cards so a device rendering a saved copy can
  // say which night it saved (docs/11 §2.5).
  return { night, cards }
})
