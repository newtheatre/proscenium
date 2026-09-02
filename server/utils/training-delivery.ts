import { and, eq, isNull } from 'drizzle-orm'
import { expiryFor, gapKey, prerequisiteGaps, saysGaps } from '#shared/utils/training'
import type { AcademicYear, DeliveryPreviewInput, PrerequisiteGap } from '#shared/utils/training'
import type { Authority } from '#server/utils/authorise'

// A delivery that already happened, worked out once. The dry-run returns this and the write
// computes it again from the same function, so a preview cannot disagree with the result (G-118).

export interface PlannedRecord {
  userId: string
  name: string
  moduleId: string
  moduleName: string
  awardedOn: string
  expiresOn: string | null
  // An unrevoked award for that person, module and day exists already, so the log adds nothing.
  alreadyHeld: boolean
}

export interface PlannedGap extends PrerequisiteGap {
  key: string
  userId: string
  name: string
  moduleName: string
}

export interface DeliveryPlan {
  heldOn: string
  records: PlannedRecord[]
  gaps: PlannedGap[]
  creates: number
  blocked: boolean
}

interface Attendee {
  id: string
  name: string
  anonymisedAt: number | null
}

export async function planDelivery(
  resolved: Authority,
  input: DeliveryPreviewInput,
  year: AcademicYear,
  today: string,
): Promise<DeliveryPlan> {
  // Criterion 1. A record dated ahead of today would read as valid to every gate until then.
  if (input.heldOn > today) {
    throw createError({
      statusCode: 422,
      statusMessage: 'A delivery is logged after it happened, so its day cannot be in the future',
    })
  }

  const taught = await assertTeachable(resolved, input.moduleIds, today)
  const attendees = await attendeesFor(input.userIds)

  const needed = await prerequisitesOf(input.moduleIds)
  const wanted = [...new Set([...needed.values()].flat().map(edge => edge.requiresId))]
  const held = await heldByEach(input.userIds, wanted, today)

  // A prerequisite this log teaches is awarded in the same batch at the same date, so it is not
  // missing by the time the log lands (G-118 criterion 3).
  const taughtIds = taught.map(module => module.id)
  const existing = await alreadyHeldPairs(input.userIds, input.moduleIds, input.heldOn)

  const records: PlannedRecord[] = []
  const gaps: PlannedGap[] = []

  for (const person of attendees) {
    const theirs = new Set([...(held.get(person.id) ?? []), ...taughtIds])
    for (const module of taught) {
      records.push({
        userId: person.id,
        name: person.name,
        moduleId: module.id,
        moduleName: module.name,
        awardedOn: input.heldOn,
        // Stamped from the policy as at the day it was taught, never as at today (G-123 c3).
        expiresOn: expiryFor(module, input.heldOn, year),
        alreadyHeld: existing.has(`${person.id}:${module.id}`),
      })

      for (const gap of prerequisiteGaps(module, needed.get(module.id) ?? [], theirs)) {
        gaps.push({
          ...gap,
          key: gapKey({ userId: person.id, moduleId: module.id, requiresId: gap.requiresId }),
          userId: person.id,
          name: person.name,
          moduleName: module.name,
        })
      }
    }
  }

  return {
    heldOn: input.heldOn,
    records,
    gaps,
    creates: records.filter(record => !record.alreadyHeld).length,
    blocked: gaps.some(gap => gap.severity === 'BLOCKS'),
  }
}

// Criterion 3's asymmetry, at the write path. A safety-critical gap has no acknowledgement and no
// override; an ordinary one needs its own key, so a tick covers exactly what it was shown for.
export function assertLoggable(plan: DeliveryPlan, acknowledged: readonly string[]): void {
  const blocking = plan.gaps.filter(gap => gap.severity === 'BLOCKS')
  if (blocking.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Safety-critical training needs its prerequisites first. Not held yet: ${saysGaps(distinct(blocking))}`,
    })
  }

  const ticked = new Set(acknowledged)
  const waiting = plan.gaps.filter(gap => !ticked.has(gap.key))
  if (waiting.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Please confirm each gap before logging. Not held yet: ${saysGaps(distinct(waiting))}`,
    })
  }
}

// The rows a confirmed log writes: everything the preview showed as new, and nothing else.
export function deliveryRecords(plan: DeliveryPlan, grantedBy: string): {
  id: string
  userId: string
  moduleId: string
  awardedOn: string
  expiresOn: string | null
  source: string
  grantedBy: string
}[] {
  return plan.records.filter(record => !record.alreadyHeld).map(record => ({
    id: newId(),
    userId: record.userId,
    moduleId: record.moduleId,
    awardedOn: record.awardedOn,
    expiresOn: record.expiresOn,
    // A delivery, logged after the fact rather than marked on a register: no session row exists
    // to point at, and `session_id` stays null (docs/data-model.md).
    source: 'SESSION',
    grantedBy,
  }))
}

// One person appears once in a refusal however many of them are missing it.
function distinct(gaps: readonly PlannedGap[]): PrerequisiteGap[] {
  return [...new Map(gaps.map(gap => [gap.requiresId, gap])).values()]
}

// One parameter for the room, whoever is in it (0003).
async function attendeesFor(userIds: string[]): Promise<Attendee[]> {
  const people = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    anonymisedAt: schema.users.anonymisedAt,
  }).from(schema.users).where(inJsonSet(schema.users.id, userIds))

  const missing = userIds.filter(id => !people.some(person => person.id === id))
  if (missing.length > 0) {
    throw createError({ statusCode: 404, statusMessage: 'Somebody on this list no longer has an account' })
  }

  // An anonymised row is never written back over (0011).
  if (people.some(person => person.anonymisedAt !== null)) {
    throw createError({ statusCode: 409, statusMessage: 'Somebody on this list has had their account erased' })
  }

  return people.sort((one, other) => one.name.localeCompare(other.name))
}

// What each attendee currently holds of the prerequisites in question. Expiring counts as held,
// because this asks heldNow rather than restating it (G-101 criterion 3).
async function heldByEach(
  userIds: string[],
  moduleIds: string[],
  today: string,
): Promise<Map<string, Set<string>>> {
  const held = new Map<string, Set<string>>()
  if (moduleIds.length === 0) return held

  const rows = await db.select({
    userId: schema.trainingRecords.userId,
    moduleId: schema.trainingRecords.moduleId,
  }).from(schema.trainingRecords).where(and(
    inJsonSet(schema.trainingRecords.userId, userIds),
    inJsonSet(schema.trainingRecords.moduleId, moduleIds),
    heldNow(today),
  ))

  for (const row of rows) {
    held.set(row.userId, (held.get(row.userId) ?? new Set()).add(row.moduleId))
  }
  return held
}

// Logging the same evening twice adds nothing: an unrevoked award already dated to that day is
// the same award, whatever wrote it.
async function alreadyHeldPairs(
  userIds: string[],
  moduleIds: string[],
  heldOn: string,
): Promise<Set<string>> {
  const rows = await db.select({
    userId: schema.trainingRecords.userId,
    moduleId: schema.trainingRecords.moduleId,
  }).from(schema.trainingRecords).where(and(
    eq(schema.trainingRecords.awardedOn, heldOn),
    isNull(schema.trainingRecords.revokedAt),
    inJsonSet(schema.trainingRecords.userId, userIds),
    inJsonSet(schema.trainingRecords.moduleId, moduleIds),
  ))

  return new Set(rows.map(row => `${row.userId}:${row.moduleId}`))
}
