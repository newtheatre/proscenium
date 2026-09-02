import { asc, eq, sql } from 'drizzle-orm'
import {
  blockingGaps,
  placesFrom,
  promotedBy,
  promotionClaimFor,
  signUpClosure,
  signUpOrderStatement,
  warningGaps,
} from '#shared/utils/training-signup'
import type { ClosureReason, Place, SignUpOrder, SignUpStatus, SignUpWindow } from '#shared/utils/training-signup'
import { prerequisiteGaps } from '#shared/utils/training'
import type { PrerequisiteGap } from '#shared/utils/training'
import type { H3Event } from 'h3'

// Reading and writing sign-ups. Nothing here stores a place: every answer is the order against
// the session's capacity, worked out at the moment it is asked for (0018, G-105).

export interface SessionPlaces {
  capacity: number
  places: Place[]
  placed: Place[]
  waitlisted: Place[]
}

// The one definition of who holds a place. G-115 opens a practice window per placed member from
// this, so there is no second reading of the same order anywhere.
export async function placesOnSession(sessionId: string): Promise<SessionPlaces> {
  const [session] = await db.select({ capacity: schema.trainingSessions.capacity })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, sessionId))
    .limit(1)

  const capacity = session?.capacity ?? 0
  const places = placesFrom(await db.all<SignUpOrder>(signUpOrderStatement(sessionId)), capacity)

  return {
    capacity,
    places,
    placed: places.filter(place => place.placed),
    waitlisted: places.filter(place => !place.placed),
  }
}

export interface SignUpSession {
  id: string
  heldOn: string
  startsAt: string
  endsAt: string
  place: string | null
  capacity: number
  opensAt: number | null
  status: string
  registerOpenedAt: number | null
  modules: { id: string, name: string, safetyCritical: boolean }[]
}

// Column allow-listed: `notes` is what the trainer wrote for themselves and never reaches a
// member-facing response.
export async function sessionForSignUp(sessionId: string): Promise<SignUpSession | null> {
  const [row] = await db.select({
    id: schema.trainingSessions.id,
    heldOn: schema.trainingSessions.heldOn,
    startsAt: schema.trainingSessions.startsAt,
    endsAt: schema.trainingSessions.endsAt,
    place: schema.trainingSessions.place,
    capacity: schema.trainingSessions.capacity,
    opensAt: schema.trainingSessions.opensAt,
    status: schema.trainingSessions.status,
    registerOpenedAt: schema.trainingSessions.registerOpenedAt,
  }).from(schema.trainingSessions).where(eq(schema.trainingSessions.id, sessionId)).limit(1)

  if (!row) return null

  const modules = await db.select({
    id: schema.trainingModules.id,
    name: schema.trainingModules.name,
    safetyCritical: schema.trainingModules.safetyCritical,
  })
    .from(schema.sessionModules)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.sessionModules.moduleId))
    .where(eq(schema.sessionModules.sessionId, sessionId))
    .orderBy(asc(schema.trainingModules.id))

  return { ...row, modules }
}

// The one predicate sign-up's closure rests on. Opening the register stamps this once, by a
// conditional write, so two devices opening it still close sign-up once (G-115 criterion 3).
export function registerIsOpen(session: { registerOpenedAt: number | null }): boolean {
  return session.registerOpenedAt !== null
}

export function windowOf(session: SignUpSession): SignUpWindow {
  return {
    heldOn: session.heldOn,
    startsAt: session.startsAt,
    opensAt: session.opensAt,
    status: session.status,
    registerOpen: registerIsOpen(session),
  }
}

// The gaps at sign-up, decided by the rule the register and the retrospective log read, never a
// second copy of it. A brief gates nothing, so it is dropped first (G-118 c3, G-102 c2).
export async function prerequisiteGapsFor(
  userId: string,
  modules: { id: string, safetyCritical: boolean }[],
  today: string,
): Promise<PrerequisiteGap[]> {
  if (modules.length === 0) return []

  const edges = await prerequisitesOf(modules.map(module => module.id))
  const held = await modulesHeldBy(userId, today)

  return modules.flatMap(module => prerequisiteGaps(
    module,
    (edges.get(module.id) ?? []).filter(edge => edge.requiresKind !== 'BRIEF'),
    held,
  ))
}

export interface MemberSessionRow {
  id: string
  heldOn: string
  startsAt: string
  endsAt: string
  place: string | null
  capacity: number
  opensAt: number | null
  status: string
  registerOpenedAt: number | null
  trainerName: string
  signedUp: number
  myStatus: SignUpStatus | null
  mySignedUpAt: number | null
  myPosition: number | null
}

export interface MemberSession extends MemberSessionRow {
  modules: { id: string, name: string, safetyCritical: boolean }[]
  // Derived from the position, never read from a column.
  placed: boolean
  waitlistPosition: number | null
  closure: ClosureReason | null
  blocked: PrerequisiteGap[]
  warnings: PrerequisiteGap[]
}

// Sessions a member can see, with where they stand on each. Their own row is a left join and
// their position a correlated count, so one session and a hundred bind the same (0003).
export async function sessionsForMember(
  userId: string,
  today: string,
  closesHours: number,
  at = new Date(),
): Promise<MemberSession[]> {
  const visible = sql`s.status in ('OPEN', 'FULL') and s.held_on >= ${today}
    and (s.opens_at is null or s.opens_at <= unixepoch())`

  const rows = await db.all<MemberSessionRow>(sql`
    select s.id, s.held_on as heldOn, s.starts_at as startsAt, s.ends_at as endsAt,
      s.place as place, s.capacity as capacity, s.opens_at as opensAt, s.status as status,
      s.register_opened_at as registerOpenedAt, u.name as trainerName,
      (select count(*) from session_attendees a
        where a.session_id = s.id and a.status <> 'CANCELLED') as signedUp,
      mine.status as myStatus, mine.signed_up_at as mySignedUpAt,
      -- Guarded by the join, not left to the count: with no row of their own every comparison is
      -- null and the count is nought, which would read as a place rather than as no sign-up.
      case when mine.id is null then null else (
        select count(*) from session_attendees a
        where a.session_id = s.id and a.status <> 'CANCELLED'
          and (a.signed_up_at < mine.signed_up_at
            or (a.signed_up_at = mine.signed_up_at and a.rowid <= mine.rowid))
      ) end as myPosition
    from training_sessions s
    join users u on u.id = s.trainer_id
    left join session_attendees mine
      on mine.session_id = s.id and mine.user_id = ${userId} and mine.status <> 'CANCELLED'
    where ${visible}
    order by s.held_on, s.starts_at
  `)

  // Scoped by repeating the predicate as a subquery, so nothing binds a parameter per session.
  const taught = await db.all<{ sessionId: string, id: string, name: string, safetyCritical: number }>(sql`
    select sm.session_id as sessionId, m.id as id, m.name as name,
      m.safety_critical as safetyCritical
    from session_modules sm
    join modules m on m.id = sm.module_id
    where sm.session_id in (select s.id from training_sessions s where ${visible})
    order by m.id
  `)

  const modulesOf = (sessionId: string) => taught
    .filter(row => row.sessionId === sessionId)
    .map(row => ({ id: row.id, name: row.name, safetyCritical: row.safetyCritical === 1 }))

  // Every module in view once, so the gaps are worked out for the member rather than per session.
  const everyModule = [...new Map(taught.map(row =>
    [row.id, { id: row.id, safetyCritical: row.safetyCritical === 1 }])).values()]
  const gaps = await prerequisiteGapsFor(userId, everyModule, today)

  return rows.map((row) => {
    const modules = modulesOf(row.id)
    const mine = gaps.filter(gap => modules.some(module => module.id === gap.moduleId))
    const placed = row.myPosition !== null && row.myPosition <= row.capacity
    return {
      ...row,
      modules,
      placed,
      waitlistPosition: row.myPosition === null || placed ? null : row.myPosition - row.capacity,
      closure: signUpClosure(
        {
          heldOn: row.heldOn,
          startsAt: row.startsAt,
          opensAt: row.opensAt,
          status: row.status,
          registerOpen: registerIsOpen(row),
        },
        closesHours,
        at,
      ),
      blocked: blockingGaps(mine),
      warnings: warningGaps(mine),
    }
  })
}

// Everybody who moved into a place since `before`, told once each. Transactional: it reads no
// sweep switch, so a promotion goes out whatever the sweeps are set to (G-106 criterion 5).
export async function notifyPromotions(
  event: H3Event | undefined,
  sessionId: string,
  before: Place[],
): Promise<number> {
  const after = await placesOnSession(sessionId)
  const promoted = promotedBy(before, after.places)
  if (promoted.length === 0) return 0

  const session = await sessionForSignUp(sessionId)
  if (!session) return 0

  let sent = 0
  for (const place of promoted) {
    // The claim is written before the message is composed, so a second process finds it and
    // sends nothing rather than reading a ledger another one is still writing (0006).
    const took = await claimNotification({
      userId: place.userId,
      type: 'training.session.promoted',
      key: promotionClaimFor(sessionId, place.userId, place.signedUpAt),
      sessionId,
    })
    if (!took) continue

    await notify(event, {
      type: 'training.session.promoted',
      userId: place.userId,
      context: {
        name: '',
        heldOn: session.heldOn,
        startsAt: session.startsAt,
        where: session.place ?? 'a place the trainer will confirm',
        modules: session.modules.map(module => ({ id: module.id, name: module.name })),
        sessionsUrl: `${useRuntimeConfig(event).public.baseURL}/training/sessions`,
      },
    })
    sent++
  }
  return sent
}
