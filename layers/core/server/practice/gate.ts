// Core's practice gate (Practice mode, part 3): the four checks before a marked request reaches the
// person's store (M1, M3), and the backstop for a practice page that forgot the mark (M2).
import { getHeader, type H3Event } from 'h3'
import { log, nowMs, refuse, useContext, usePoint, type Actor, type PracticeAnswer, type PracticeChecks } from '#kit'
import { practiceEnv } from '#kit/practice/env'
import { bundleHash } from '#kit/migrations'
import type { PracticeGate } from '#kit/practice/gate'
import { endPractice, practiceOf, readSession, touch, type EndReason, type SessionRow } from './session'
import { mayPractise, scenario, tasksFor, unavailable } from './scenarios'

function ended(): never {
  refuse('core.practice.ended', 'This practice has ended.', { status: 409, remedy: 'Start again to carry on.' })
}

/** Why a session that exists may not go on, or null while it may (S5, S7). */
async function endingReason(row: SessionRow, at: number): Promise<EndReason | null> {
  if (row.bundle_hash !== await bundleHash()) return 'updated'
  if (at >= row.ends_at) return at >= row.night_ends_at ? 'night' : 'idle'
  const s = await scenario(row.scenario_id)
  const blocked = s ? await unavailable(s) : { code: 'core.practice.scenario-off' as const }
  if (blocked?.code === 'core.practice.switched-off') return 'switched-off'
  if (blocked) return 'scenario-off'
  return null
}

/** The path of the page a request came from, when it came from this site. */
function refererPath(event: H3Event): string | null {
  const referer = getHeader(event, 'referer')
  if (!referer) return null
  try {
    return new URL(referer).pathname
  }
  catch {
    return null
  }
}

export const practiceGate: PracticeGate = {
  async enter(_event, actor: Actor) {
    if (actor.kind !== 'person' || !actor.accountId) refuse('core.practice.not-allowed', 'Practice is for signed-in people.', { status: 403 })
    const row = await readSession(actor.accountId)
    if (!row) ended()
    const at = nowMs()
    const reason = await endingReason(row, at)
    if (reason) {
      await endPractice(actor.accountId, reason)
      ended()
    }
    if (!(await mayPractise(actor, row.scenario_id))) refuse('core.practice.not-allowed', 'Practice opens through a training course.', { status: 403 })
    const s = (await scenario(row.scenario_id))!
    await touch(row, at)
    const practice = practiceOf(row, s)
    const inStore: Actor = {
      kind: 'person',
      accountId: actor.accountId,
      name: actor.name,
      // Confirming it is you is pretend in practice (M6): the press is recorded in the store only.
      assurance: 'strong',
      reassertedAt: row.reasserted_at ?? undefined,
      grants: s.abilities.map(ability => ({ ability, via: `practice:${s.id}` })),
    }
    return { env: practiceEnv(useContext().env, actor.accountId, row.night_ends_at), actor: inStore, practice }
  },

  unmarked(event) {
    const method = event.method.toUpperCase()
    if (method === 'GET' || method === 'HEAD') return
    if (!refererPath(event)?.startsWith('/practice/')) return
    log.error('core.practice.unmarked-request', { path: event.path.split('?')[0], method })
    refuse('core.practice.unmarked-request', 'This change came from a practice page without the practice mark, so nothing was saved.', { status: 409, remedy: 'Reload the page, then try again.' })
  },

  async changed(answer) {
    const practice = useContext().practice
    if (!practice) return
    await tickTasks(practice.scenarioId, answer)
  },
}

/** Runs the scenario's checks that have not passed, and records each that passes now (T1, T2). */
export async function tickTasks(scenarioId: string, answer?: PracticeAnswer): Promise<string[]> {
  const { env, practice } = useContext()
  const s = await scenario(scenarioId)
  const checks = (await usePoint<PracticeChecks>('core.practice-check')).find(c => c.id === scenarioId)?.value
  if (!s?.tasks?.length || !checks || !practice) return []
  const passed = new Set((await env.DB.prepare('SELECT task_id FROM core_practice_task_results').all<{ task_id: string }>()).results.map(r => r.task_id))
  const row = await env.DB.prepare('SELECT * FROM core_practice_session LIMIT 1').first<SessionRow>()
  if (!row) return []
  const context = { accountId: row.account_id, name: null, staffId: JSON.parse(row.results).staff, startedAt: row.started_at, results: JSON.parse(row.results), answer }
  const now: string[] = []
  for (const task of tasksFor(s, context.results)) {
    if (passed.has(task.id) || !checks[task.id]) continue
    if (await checks[task.id]!(context)) now.push(task.id)
  }
  if (now.length) await env.DB.batch(now.map(id => env.DB.prepare('INSERT OR IGNORE INTO core_practice_task_results (task_id, passed_at) VALUES (?, ?)').bind(id, nowMs())))
  return now
}
