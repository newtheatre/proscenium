// What the practice screens read and do (Practice mode, part 5): the scenario list, starting and
// leaving, and inside a store the panel's tasks, outbox and waiting card reader.
import { createUnit, nowMs, refuse, useContext, useSetting, type Actor } from '#kit'
import { bundleHash } from '#kit/migrations'
import { answerPracticeCall } from '#kit/external'
import { newId } from '#kit/ids'
import { useRegistry } from '#kit/registry'
import { checking, mayPractise, scenario, scenarios, unavailable, type PracticeScenario, type Unavailable } from './scenarios'
import { lastEnded, readSession, startPractice, type SessionRow, type StartOptions } from './session'

export interface ScenarioCard {
  id: string
  label: string
  summary: string
  minutes: number
  /** The live pages it covers, for a live screen's "Practise this screen". */
  routes: string[]
  /** Why it cannot start here, or null. */
  unavailable: Unavailable | null
}

/** PM-S1: the scenarios open to this person, their active session, and why the last one ended. */
export async function practiceList(actor: Actor) {
  const admin = await checking(actor)
  const cards: ScenarioCard[] = []
  for (const s of await scenarios()) {
    if (!admin && !(await mayPractise(actor, s.id))) continue
    cards.push({ id: s.id, label: s.label, summary: s.summary, minutes: s.minutes, routes: s.routes, unavailable: await unavailable(s) })
  }
  const session = actor.accountId ? await readSession(actor.accountId) : null
  return {
    enabled: await useSetting('core.practice.enabled') as boolean,
    checking: admin,
    scenarios: cards,
    active: session ? { scenarioId: session.scenario_id, startedAt: session.started_at } : null,
    ended: actor.accountId ? await lastEnded(actor.accountId) : null,
  }
}

/** The live page a scenario opens, with its placeholders filled from the sample sets' named results. */
export function startPath(s: PracticeScenario, row: SessionRow): string {
  const results = JSON.parse(row.results) as Record<string, string>
  return `/practice${s.start.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(results[name] ?? name))}`
}

/** S2 to S4, S8: makes or resumes the store, and answers where to go. */
export async function start(actor: Actor, scenarioId: string, options: StartOptions) {
  const row = await startPractice(actor, scenarioId, options)
  const s = (await scenario(scenarioId))!
  return { scenarioId, to: startPath(s, row), newer: s.version > row.scenario_version, startedAt: row.started_at }
}

function inStore(): void {
  if (!useContext().practice) refuse('core.practice.ended', 'This practice has ended.', { status: 409 })
}

/** PM-S4: the panel, read inside the store. */
export async function panel() {
  inStore()
  const { env, practice } = useContext()
  const row = (await env.DB.prepare('SELECT * FROM core_practice_session LIMIT 1').first<SessionRow>())!
  const s = (await scenario(practice!.scenarioId))!
  const passed = new Map((await env.DB.prepare('SELECT task_id, passed_at FROM core_practice_task_results').all<{ task_id: string, passed_at: number }>()).results.map(r => [r.task_id, r.passed_at]))
  const outbox = (await env.DB.prepare('SELECT id, type_key, to_label, subject, at FROM core_practice_outbox ORDER BY at DESC').all<{ id: string, type_key: string, to_label: string, subject: string | null, at: number }>()).results
  const waiting = (await env.DB.prepare(`SELECT c.attempt_id, c.call, c.reference FROM core_practice_calls c WHERE c.answer = 'waiting'
    AND NOT EXISTS (SELECT 1 FROM core_practice_calls d WHERE d.attempt_id = c.attempt_id AND d.answer <> 'waiting') ORDER BY c.at`).all<{ attempt_id: string, call: string, reference: string }>()).results
  return {
    scenario: { id: s.id, label: s.label, version: row.scenario_version, newer: s.version > row.scenario_version, start: startPath(s, row), routes: s.routes, runnable: s.runnable ?? [] },
    startedAt: row.started_at,
    endsAt: row.ends_at,
    idleEnd: await useSetting('core.practice.idle-end') as number,
    tasks: (s.tasks ?? []).map(task => ({ id: task.id, label: task.label, passedAt: passed.get(task.id) ?? null })),
    outbox: outbox.map(m => ({ id: m.id, typeKey: m.type_key, to: m.to_label, subject: m.subject, at: m.at })),
    waiting: waiting.map(w => ({ attemptId: w.attempt_id, call: w.call, reference: w.reference, outcomes: s.outcomes?.[w.call] ?? ['approved', 'declined', 'removed', 'no-answer'] })),
    updated: row.bundle_hash !== await bundleHash(),
  }
}

/** PM-S8: one would-be email. */
export async function outboxEmail(id: string) {
  inStore()
  const row = await useContext().env.DB.prepare('SELECT id, type_key, to_label, subject, body_html, body_text, at FROM core_practice_outbox WHERE id = ?').bind(id)
    .first<{ id: string, type_key: string, to_label: string, subject: string | null, body_html: string | null, body_text: string | null, at: number }>()
  if (!row) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return { id: row.id, typeKey: row.type_key, to: row.to_label, subject: row.subject, html: row.body_html, text: row.body_text, at: row.at }
}

/** M6: the pretend "confirm it's you", which accepts a press and touches only the store. */
export async function pretendReassert(): Promise<{ reassertedAt: number }> {
  inStore()
  const at = nowMs()
  await useContext().env.DB.prepare('UPDATE core_practice_session SET reasserted_at = ?').bind(at).run()
  return { reassertedAt: at }
}

/** PM-S7: the trainee's choice. "No answer" leaves the payment unknown, so the till takes its timeout path. */
export async function answerCardReader(attemptId: string, outcome: 'approved' | 'declined' | 'removed' | 'no-answer'): Promise<{ state: string }> {
  inStore()
  if (outcome !== 'no-answer') return { state: (await answerPracticeCall(attemptId, outcome === 'approved' ? { result: 'succeeded' } : { result: 'failed', data: { reason: outcome } })).state }
  const { env } = useContext()
  const attempt = await env.DB.prepare("SELECT purpose, reference FROM core_external_calls WHERE id = ? AND phase = 'attempt'").bind(attemptId).first<{ purpose: string, reference: string }>()
  if (!attempt) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  await env.DB.prepare("INSERT INTO core_practice_calls (id, attempt_id, call, reference, answer, chosen_by, at) VALUES (?, ?, ?, ?, 'unknown', 'trainee', ?)").bind(newId('pca'), attemptId, attempt.purpose, attempt.reference, nowMs()).run()
  return { state: 'unknown' }
}

/** O4: one of the scenario's scheduled tasks, run in the store now; nothing runs a store's tasks on a timer. */
export async function runNow(task: string): Promise<{ jobId: string }> {
  inStore()
  const s = (await scenario(useContext().practice!.scenarioId))!
  const declared = useRegistry().tasks.get(task)
  if (!declared || !(s.runnable ?? []).includes(task)) refuse('core.practice.not-runnable', 'This practice does not run that.', { status: 404 })
  const dueAt = nowMs()
  const unit = createUnit()
  unit.add({ sql: 'INSERT OR IGNORE INTO core_task_runs (task, due_at) VALUES (?, ?)', params: [task, dueAt] })
  const jobId = unit.queueInternal('task', task, declared.module, { dueAt })
  await unit.commit()
  return { jobId }
}
