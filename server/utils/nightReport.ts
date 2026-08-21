import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, isNotNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { NightReport } from '../db/schema/reports'

/**
 * Builds the record the report *is*: the email is a courtesy copy (docs/12
 * §4.2). Access appears as counts only, never needs and never names (§2.5).
 */
export async function buildNightReport(performanceId: string): Promise<NightReport> {
  const performance = await db.select({
    id: schema.performances.id,
    startsAt: schema.performances.startsAt,
    capacityOverride: schema.performances.capacityOverride,
    venueCapacity: schema.venues.capacity,
    venueName: schema.venues.name,
    showTitle: schema.shows.title,
  })
    .from(schema.performances)
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(eq(schema.performances.id, performanceId))
    .get()

  if (!performance) throw createError({ statusCode: 404, statusMessage: 'Performance not found' })

  const night = showNightDate(performance.startsAt)

  const [sold, collected] = await Promise.all([
    countOccupiedSeatsFor(performanceId),
    countCollectedSeatsFor(performanceId),
  ])

  const [noShowRow] = await db.select({ value: count() })
    .from(schema.reservations)
    .where(and(
      eq(schema.reservations.performanceId, performanceId),
      eq(schema.reservations.status, 'NO_SHOW'),
    ))

  const [walkUpRow] = await db.select({ value: count() })
    .from(schema.transactionLines)
    .where(and(
      eq(schema.transactionLines.performanceId, performanceId),
      eq(schema.transactionLines.kind, 'WALK_UP'),
    ))

  const [passRow] = await db.select({ value: count() })
    .from(schema.passAdmissions)
    .where(eq(schema.passAdmissions.performanceId, performanceId))

  const takings = await takingsForPerformance(performanceId)
  const access = await accessCountsFor(performanceId)

  const author = alias(schema.users, 'incident_author')
  const incidents = await db.select({
    at: schema.incidentLog.createdAt,
    author: author.name,
    body: schema.incidentLog.body,
  })
    .from(schema.incidentLog)
    .leftJoin(author, eq(author.id, schema.incidentLog.authorUserId))
    .where(eq(schema.incidentLog.performanceId, performanceId))
    .orderBy(asc(schema.incidentLog.createdAt))

  // The theatre's first curtain-up data. The message snapshots its own label
  // and milestone, so a later edit to a preset cannot rewrite the night.
  const milestones = await db.select({
    at: schema.backstageMessages.createdAt,
    label: schema.backstageMessages.label,
  })
    .from(schema.backstageMessages)
    .innerJoin(schema.backstageNights, eq(schema.backstageNights.id, schema.backstageMessages.nightId))
    .where(and(
      eq(schema.backstageNights.night, night),
      isNotNull(schema.backstageMessages.milestone),
    ))
    .orderBy(asc(schema.backstageMessages.createdAt))

  const staffing = await db.select({
    role: schema.performanceShifts.role,
    name: schema.users.name,
    status: schema.performanceShifts.status,
  })
    .from(schema.performanceShifts)
    .leftJoin(schema.users, eq(schema.users.id, schema.performanceShifts.userId))
    .where(eq(schema.performanceShifts.performanceId, performanceId))
    .orderBy(asc(schema.performanceShifts.role))

  return {
    performance: {
      id: performance.id,
      showTitle: performance.showTitle,
      venueName: performance.venueName,
      startsAt: performance.startsAt.toISOString(),
      night,
    },
    attendance: {
      capacity: performance.capacityOverride ?? performance.venueCapacity,
      sold,
      collected,
      noShows: noShowRow?.value ?? 0,
      walkUps: walkUpRow?.value ?? 0,
      passAdmissions: passRow?.value ?? 0,
    },
    takings,
    access,
    incidents: incidents.map(i => ({ at: String(i.at), author: i.author, body: i.body })),
    milestones: milestones.map(m => ({ at: String(m.at), label: m.label })),
    staffing,
    bar: await barSectionFor(performanceId, night),
  }
}

/** How this performance did, by `transaction_lines.performance_id` (docs/13 §4.5). */
async function takingsForPerformance(performanceId: string) {
  const rows = await db.select({
    kind: schema.transactionLines.kind,
    tender: schema.transactions.tender,
    amount: sql<number>`coalesce(sum(${schema.transactionLines.amountPence}), 0)`,
  })
    .from(schema.transactionLines)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.transactionLines.transactionId))
    .where(eq(schema.transactionLines.performanceId, performanceId))
    .groupBy(schema.transactionLines.kind, schema.transactions.tender)

  let ticketsPence = 0
  let walkUpPence = 0
  let compPence = 0
  for (const row of rows) {
    if (row.tender === 'COMP') compPence += Number(row.amount)
    else if (row.kind === 'WALK_UP') walkUpPence += Number(row.amount)
    else ticketsPence += Number(row.amount)
  }

  // Bar money belongs to the session, not the performance: it is in the Bar
  // section, and adding it here would count a double bill's takings twice.
  return { ticketsPence, walkUpPence, compPence, totalPence: ticketsPence + walkUpPence }
}

/**
 * Counts only. Never the need, never the name: a report is forwarded, and a
 * disability is special category data (ADR-0022).
 */
async function accessCountsFor(performanceId: string) {
  const [row] = await db.select({
    bookings: sql<number>`count(distinct ${schema.reservations.id})`,
  })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.reservations.id, schema.tickets.reservationId))
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(and(
      eq(schema.reservations.performanceId, performanceId),
      isNotNull(schema.ticketTypes.accessKind),
    ))

  const [verified] = await db.select({
    value: sql<number>`count(distinct ${schema.accessProfiles.userId})`,
  })
    .from(schema.accessProfiles)
    .innerJoin(schema.reservations, eq(schema.reservations.userId, schema.accessProfiles.userId))
    .where(and(
      eq(schema.reservations.performanceId, performanceId),
      eq(schema.accessProfiles.status, 'VERIFIED'),
    ))

  return { bookingsWithNeeds: Number(row?.bookings ?? 0), verified: Number(verified?.value ?? 0) }
}

/** The Bar section, where a session served this performance (docs/13 §4.5). */
async function barSectionFor(performanceId: string, night: string): Promise<NightReport['bar']> {
  const session = await db.select({
    id: schema.barSessions.id,
    closedAt: schema.barSessions.closedAt,
    closingNote: schema.barSessions.closingNote,
  })
    .from(schema.barSessions)
    .innerJoin(schema.barSessionPerformances, eq(schema.barSessionPerformances.sessionId, schema.barSessions.id))
    .where(eq(schema.barSessionPerformances.performanceId, performanceId))
    .get()

  if (!session) return null

  const byTender = await db.select({
    tender: schema.transactions.tender,
    totalPence: sql<number>`coalesce(sum(${schema.transactions.totalPence}), 0)`,
  })
    .from(schema.transactions)
    .where(eq(schema.transactions.barSessionId, session.id))
    .groupBy(schema.transactions.tender)

  const requester = alias(schema.users, 'comp_requester')
  const approver = alias(schema.users, 'comp_approver')
  const comps = await db.select({
    lines: schema.compRequests.lines,
    reason: schema.compRequests.reason,
    requestedBy: requester.name,
    approvedBy: approver.name,
  })
    .from(schema.compRequests)
    .leftJoin(requester, eq(requester.id, schema.compRequests.requestedByUserId))
    .leftJoin(approver, eq(approver.id, schema.compRequests.decidedByUserId))
    .where(and(eq(schema.compRequests.night, night), eq(schema.compRequests.status, 'APPROVED')))

  const checks = await db.select({
    outcome: schema.ageChecks.outcome,
    value: count(),
  })
    .from(schema.ageChecks)
    .where(eq(schema.ageChecks.performanceId, performanceId))
    .groupBy(schema.ageChecks.outcome)

  return {
    sessionId: session.id,
    takingsByTender: byTender.map(t => ({ tender: t.tender, totalPence: Number(t.totalPence) })),
    comps: comps.map(c => ({
      what: c.lines.map(l => `${l.qty} x ${l.name}`).join(', '),
      reason: c.reason,
      requestedBy: c.requestedBy,
      approvedBy: c.approvedBy,
    })),
    idChecks: {
      accepted: Number(checks.find(c => c.outcome === 'ACCEPTED')?.value ?? 0),
      refused: Number(checks.find(c => c.outcome === 'REFUSED')?.value ?? 0),
    },
    lowStock: await lowStockNames(),
    closingNote: session.closingNote,
    unclosed: session.closedAt === null,
  }
}

async function lowStockNames(): Promise<string[]> {
  const onHand = await onHandByProduct()
  const products = await db.select({
    id: schema.barProducts.id,
    name: schema.barProducts.name,
    parMilli: schema.barProducts.parMilli,
  }).from(schema.barProducts).where(isNotNull(schema.barProducts.parMilli))

  return products
    .filter(p => (onHand.get(p.id) ?? 0) < p.parMilli!)
    .map(p => p.name)
}

export interface CloseNightInput {
  performanceId: string
  closedByUserId: string | null
  autoClosed: boolean
  closingNote: string | null
  checklist: Record<string, boolean> | null
}

/**
 * Stores the report, revokes the night's backstage codes and sends the
 * courtesy copy. The stored row is the record (docs/12 §4.2).
 */
export async function closeNight(input: CloseNightInput) {
  const payload = await buildNightReport(input.performanceId)

  const [stored] = await db.insert(schema.performanceReports).values({
    performanceId: input.performanceId,
    night: payload.performance.night,
    closedByUserId: input.closedByUserId,
    autoClosed: input.autoClosed,
    closingNote: input.closingNote,
    checklist: input.checklist,
    payload,
  }).returning()

  // Closing the night ends every backstage session for it (docs/11 §5.1).
  await resetCode(payload.performance.night, input.closedByUserId)

  await emailNightReport(stored!.id, payload, input.autoClosed)
  return stored!
}
