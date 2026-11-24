// A person's practice session and its store (Practice mode, part 3, rules S1 to S9). The session row
// lives in the store, so nothing in the real database records that a session exists.
import { createUnit, log, nowMs, refuse, runInContext, usePoint, useContext, useSetting, type Actor, type PracticeSample, type PracticeSession } from '#kit'
import { SYSTEM } from '#kit/context'
import { storeDatabase } from '#kit/practice/database'
import { endedKey, practiceEnv, practiceStore } from '#kit/practice/env'
import { PRACTICE_TABLES } from '#kit/practice/tables'
import { applyMigrations, bundleHash } from '#kit/migrations'
import { newId } from '#kit/ids'
import { dayRule, operatingDayAt, operatingDayBounds } from '../calendar'
import { copyStatements } from './copy'
import { scenario, unavailable, mayPractise, type PracticeScenario } from './scenarios'

export interface SessionRow {
  id: string
  account_id: string
  scenario_id: string
  scenario_version: number
  bundle_hash: string
  started_at: number
  last_active_at: number
  night_ends_at: number
  ends_at: number
  reasserted_at: number | null
  results: string
}

/** Why a session ended, for the Ended screen (PM-S6). */
export type EndReason = 'left' | 'idle' | 'night' | 'updated' | 'switched-off' | 'scenario-off' | 'again' | 'replaced' | 'erased' | 'merged'

const DAY = 86_400_000 // not-policy: a day in milliseconds, when no time zone is set yet

/** The session in a person's store, or null when they have none. */
export async function readSession(accountId: string): Promise<SessionRow | null> {
  const env = useContext().env
  if (!env.PRACTICE) return null
  return await practiceStore(env, accountId).sessionRow() as SessionRow | null
}

/** Why the person's last session ended, if it ended in the last day. */
export async function lastEnded(accountId: string): Promise<{ reason: EndReason, scenarioId: string } | null> {
  const note = await useContext().env.CACHE?.get(endedKey(accountId))
  return note ? JSON.parse(note) : null
}

/** Ends a person's session (rule S5): the store's storage, files and cache keys are gone when it returns. */
export async function endPractice(accountId: string, reason: EndReason): Promise<void> {
  const env = useContext().env
  if (!env.PRACTICE) return
  const session = await readSession(accountId)
  if (session && env.CACHE) await env.CACHE.put(endedKey(accountId), JSON.stringify({ reason, scenarioId: session.scenario_id }), { expirationTtl: 86_400 }) // not-policy: the Ended screen's note lasts a day
  await practiceStore(env, accountId).destroy()
}

/** The end of the show night the session started in (rule S5): the next day start. */
async function nightEnds(startedAt: number): Promise<number> {
  const rule = await dayRule()
  return rule ? operatingDayBounds(operatingDayAt(startedAt, rule), rule).end : startedAt + DAY
}

/** When the session ends if nothing moves it on: the earlier of the idle limit and the end of the night. */
async function endsAt(lastActive: number, nightEnd: number): Promise<number> {
  const idle = await useSetting('core.practice.idle-end') as number
  return Math.min(lastActive + idle * 1000, nightEnd) // not-policy: seconds to milliseconds
}

/** The practice session a marked request runs under. */
export function practiceOf(row: SessionRow, s: PracticeScenario): PracticeSession {
  return { accountId: row.account_id, scenarioId: row.scenario_id, abilities: s.abilities, endsBy: row.night_ends_at }
}

/** Notes a marked request, at most once a minute, and moves the store's end on (rule S5). */
export async function touch(row: SessionRow, at: number): Promise<void> {
  if (at - row.last_active_at < 60_000) return // not-policy: at most once a minute, as the spec says
  const ends = await endsAt(at, row.night_ends_at)
  const store = practiceStore(useContext().env, row.account_id)
  await storeDatabase(store).prepare('UPDATE core_practice_session SET last_active_at = ?, ends_at = ?').bind(at, ends).run()
  await store.endAt(ends)
}

/** The sample sets a scenario needs, each after those it names in `after` (part 4). */
async function orderedSamples(ids: readonly string[]): Promise<{ id: string, sample: PracticeSample }[]> {
  const declared = new Map((await usePoint<PracticeSample>('core.practice-sample')).map(c => [c.id, c.value]))
  const out: { id: string, sample: PracticeSample }[] = []
  const visit = (id: string, path: string[]) => {
    if (out.some(o => o.id === id)) return
    if (path.includes(id)) throw new Error(`Practice sample sets run in a cycle: ${[...path, id].join(' -> ')}`)
    const sample = declared.get(id)
    if (!sample) throw new Error(`"${id}" is not a contributed practice sample set`)
    for (const before of sample.after ?? []) visit(before, [...path, id])
    out.push({ id, sample })
  }
  for (const id of ['core.people', ...ids]) visit(id, [])
  return out
}

/** Makes the store from nothing (rule S3): the bundle, the copy, the sample sets and the session row. */
async function makeStore(actor: Actor, s: PracticeScenario, at: number): Promise<SessionRow> {
  const real = useContext().env
  const accountId = actor.accountId!
  const store = practiceStore(real, accountId)
  await store.destroy()
  const nightEnd = await nightEnds(at)
  const ends = await endsAt(at, nightEnd)
  const staffId = newId('acc')
  const copied = await copyStatements(staffId)
  const row: SessionRow = { id: newId('pss'), account_id: accountId, scenario_id: s.id, scenario_version: s.version, bundle_hash: await bundleHash(), started_at: at, last_active_at: at, night_ends_at: nightEnd, ends_at: ends, reasserted_at: null, results: '{}' }
  const env = practiceEnv(real, accountId, nightEnd)
  const practice = practiceOf(row, s)
  await runInContext({ env, actor: SYSTEM, practice, cache: {} }, async () => {
    await applyMigrations(env.DB)
    await env.DB.batch([...PRACTICE_TABLES.map(sql => env.DB.prepare(sql)), ...copied.map(c => env.DB.prepare(c.sql).bind(...c.params))])
    const results: Record<string, string> = { staff: staffId }
    const context = { accountId, name: actor.name ?? null, staffId, startedAt: at, results }
    for (const { sample } of await orderedSamples(s.samples)) {
      const unit = createUnit()
      Object.assign(results, await sample.seed(unit.view(), { ...context, results: { ...results } }) ?? {})
      await unit.commit()
    }
    row.results = JSON.stringify(results)
    await env.DB.prepare('INSERT INTO core_practice_session (id, account_id, scenario_id, scenario_version, bundle_hash, started_at, last_active_at, night_ends_at, ends_at, reasserted_at, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.account_id, row.scenario_id, row.scenario_version, row.bundle_hash, row.started_at, row.last_active_at, row.night_ends_at, row.ends_at, null, row.results).run()
  })
  await store.endAt(ends)
  return row
}

export interface StartOptions {
  /** Start again (S4): end the store and make a new one from the scenario's current version. */
  again?: boolean
  /** Leave another scenario's session first (S2): the person has said yes to the question. */
  replace?: boolean
}

/**
 * Starts or carries on a person's practice of a scenario (S1 to S4, S8). Refuses with the reason a
 * scenario cannot start, or `core.practice.other-active` while another scenario's session is on.
 */
export async function startPractice(actor: Actor, scenarioId: string, options: StartOptions = {}): Promise<SessionRow> {
  const s = await startable(actor, scenarioId)
  const accountId = actor.accountId!
  const current = await readSession(accountId)
  const carried = current && !options.again ? await carryOn(current, s, options) : null
  if (carried) return carried
  if (current) await endPractice(accountId, options.again ? 'again' : current.scenario_id === s.id ? 'updated' : 'replaced')
  try {
    return await makeStore(actor, s, nowMs())
  }
  catch (error) {
    const reference = useContext().requestId
    log.error('core.practice.could-not-start', { scenario: s.id, reference, error: String((error as Error)?.message ?? error) })
    await practiceStore(useContext().env, accountId).destroy()
    refuse('core.practice.could-not-start', "Practice couldn't start.", { status: 500, remedy: `Try again. If it keeps happening, give an administrator this reference: ${reference}` })
  }
}

/** The scenario, once this person may start it here (S1), or the refusal saying why not. */
async function startable(actor: Actor, scenarioId: string): Promise<PracticeScenario> {
  if (actor.kind !== 'person' || !actor.accountId) refuse('core.practice.not-allowed', 'Practice is for signed-in people.', { status: 403 })
  const s = await scenario(scenarioId)
  if (!s) refuse('core.practice.unknown', "This practice isn't available.", { status: 404 })
  if (!(await mayPractise(actor, s.id))) refuse('core.practice.not-allowed', 'Practice opens through a training course.', { status: 403, remedy: 'Ask your trainer which course opens this practice.' })
  const blocked = await unavailable(s)
  if (blocked) refuse(blocked.code, "This practice can't start here.", { status: 409 })
  return s
}

/** The session carried on (S8), or null when a new store is needed; refuses to replace another scenario's unasked (S2). */
async function carryOn(current: SessionRow, s: PracticeScenario, options: StartOptions): Promise<SessionRow | null> {
  if (current.scenario_id === s.id && current.bundle_hash === await bundleHash()) {
    await touch(current, nowMs())
    return current
  }
  if (current.scenario_id !== s.id && !options.replace) refuse('core.practice.other-active', 'Another practice is still going.', { status: 409, remedy: 'Leave it first, then start this one.' })
  return null
}
