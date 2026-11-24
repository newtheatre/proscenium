// Online lessons (amended part 3, O1 to O5; TR-39, TR-40). A lesson step's sections open in order;
// reaching the last of them, with every one reached inside the progress window, writes the lesson
// sign-off and evaluates the award in the same unit (O2). Sections belong to the course version.
import { all, first, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { canonicalAccount } from '#modules/core'
import { courseOrRefuse, getStep, preparing } from './courses'
import { theatreDay } from './days'
import { addSignOff, evaluateAward, neededSteps } from './progress'

const SECOND = 1000 // not-policy: settings are whole seconds

export interface Section {
  id: string
  stepId: string
  position: number
  kind: 'content' | 'practice'
  title: string
  body: string | null
  videoUrl: string | null
  videoCaptionNote: string | null
  scenarioId: string | null
  carriesSectionId: string | null
}

const SECTION = `SELECT id, step_id AS stepId, position, kind, title, body, video_url AS videoUrl, video_caption_note AS videoCaptionNote, scenario_id AS scenarioId,
  carries_section_id AS carriesSectionId FROM training_lesson_sections`

export async function sectionsOf(stepId: string): Promise<Section[]> {
  return all<Section>(`${SECTION} WHERE step_id = ? ORDER BY position`, stepId)
}

async function lessonStepOrRefuse(courseId: string, stepId: string) {
  const step = await getStep(stepId)
  if (!step || step.courseId !== courseId || step.kind !== 'lesson') refuse('training.step.not-found', 'There is no such lesson on this course.', { status: 404 })
  return step
}

/** Saves a lesson's sections in order, on the version in preparation (TR-39, O5). */
export async function saveSections(unit: UnitView, courseId: string, stepId: string, input: { id?: string, kind: 'content' | 'practice', title: string, body?: string | null, videoUrl?: string | null, videoCaptionNote?: string | null, scenarioId?: string | null, changed?: boolean }[]): Promise<string[]> {
  const step = await lessonStepOrRefuse(courseId, stepId)
  const version = await preparing(courseId)
  if (!version || version.id !== step.versionId) refuse('training.version-published', 'This version is published, so its lesson cannot be changed.', { status: 409, remedy: 'Start a new version to change the lesson.' })
  const before = new Map((await sectionsOf(stepId)).map(x => [x.id, x]))
  const at = nowMs()
  const rows = input.map((x, i) => {
    const old = x.id ? before.get(x.id) : undefined
    if (x.id && !old) refuse('training.section.not-found', 'A section was changed by someone else while you were editing.', { status: 409, remedy: 'Reload the lesson and try again.' })
    if ((x.kind === 'practice') !== !!x.scenarioId) refuse('training.section.scenario', 'A practice section names a scenario, and only a practice section does.', { status: 422 })
    return {
      id: old?.id ?? newId('tlsc'), position: i + 1, kind: x.kind, title: x.title, body: x.body ?? null, videoUrl: x.videoUrl ?? null,
      videoCaptionNote: x.videoCaptionNote ?? null, scenarioId: x.kind === 'practice' ? x.scenarioId : null,
      carriesSectionId: old && !x.changed && old.kind === x.kind ? old.carriesSectionId : null,
    }
  })
  unit.add({ sql: 'DELETE FROM training_lesson_sections WHERE step_id = ?', params: [stepId] })
  unit.add({
    sql: `INSERT INTO training_lesson_sections (id, step_id, position, kind, title, body, video_url, video_caption_note, scenario_id, carries_section_id, created_at, updated_at)
      SELECT j.value ->> 'id', ?1, j.value ->> 'position', j.value ->> 'kind', j.value ->> 'title', j.value ->> 'body', j.value ->> 'videoUrl', j.value ->> 'videoCaptionNote',
        j.value ->> 'scenarioId', j.value ->> 'carriesSectionId', ?2, ?2 FROM json_each(?3) j /* not-policy: bound parameters */`,
    params: [stepId, at, JSON.stringify(rows)],
  }).expect(rows.length)
  unit.audit({ action: 'update', record: ['training.course', courseId], detail: { lesson: stepId, sections: rows.length } })
  return rows.map(r => r.id)
}

/** Every section a section carries from, itself first, so progress on an earlier version still counts (O5). */
async function lineages(sections: Section[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (const x of sections) {
    const line = [x.id]
    let next = x.carriesSectionId
    while (next && !line.includes(next)) {
      line.push(next)
      next = (await first<{ carries: string | null }>('SELECT carries_section_id AS carries FROM training_lesson_sections WHERE id = ?', next))?.carries ?? null
    }
    out.set(x.id, line)
  }
  return out
}

/** Which sections of a live lesson the person has reached inside the progress window, and since their last award. */
async function reachedIn(accountId: string, sections: Section[], since: number): Promise<Set<string>> {
  const lines = await lineages(sections)
  const all_ = [...lines.values()].flat()
  const rows = await all<{ sectionId: string }>(
    `SELECT DISTINCT section_id AS sectionId FROM training_lesson_progress WHERE account_id IN (${accountScopeSql('?1')}) AND section_id IN (SELECT value FROM json_each(?2)) AND reached_at >= ?3`,
    accountId, JSON.stringify(all_), since,
  )
  const hit = new Set(rows.map(r => r.sectionId))
  return new Set(sections.filter(x => lines.get(x.id)!.some(id => hit.has(id))).map(x => x.id))
}

async function windowStart(courseId: string, accountId: string): Promise<number> {
  const course = await courseOrRefuse(courseId)
  const { since } = await neededSteps(course, accountId)
  const window = nowMs() - (await useSetting('training.progress.complete-within') as number) * SECOND
  return Math.max(window, since ?? 0)
}

export interface LessonView { step: { id: string, title: string }, sections: (Section & { reached: boolean, open: boolean })[], done: boolean }

/** A live lesson as the person sees it: each section, whether they reached it, and whether it is open to them (O1). */
export async function lessonFor(actor: Actor, courseId: string, stepId: string): Promise<LessonView> {
  const step = await lessonStepOrRefuse(courseId, stepId)
  if (step.versionStatus !== 'live') refuse('training.step.not-live', 'That lesson is not on the version of the course people take now.', { status: 409 })
  const sections = await sectionsOf(stepId)
  const reached = actor.accountId ? await reachedIn(actor.accountId, sections, await windowStart(courseId, actor.accountId)) : new Set<string>()
  const view = sections.map((x, i) => ({ ...x, reached: reached.has(x.id), open: i === 0 || reached.has(x.id) || reached.has(sections[i - 1]!.id) }))
  return { step: { id: step.id, title: step.title }, sections: view, done: view.every(x => x.reached) }
}

/**
 * The signed-in person reaches a section (O1, O2): it must be open to them; reaching is recorded
 * once, and reaching the last unreached section writes the lesson sign-off and evaluates the award.
 */
export async function reachSection(unit: UnitView, actor: Actor, { courseId, stepId, sectionId }: { courseId: string, stepId: string, sectionId: string }): Promise<{ done: boolean, signOffId: string | null, recordId: string | null }> {
  if (!actor.accountId) refuse('core.auth.required', 'Sign in first.', { status: 401 })
  const course = await courseOrRefuse(courseId)
  if (course.status !== 'live') refuse('training.course.not-live', 'Only a live course takes sign-offs.', { status: 409 })
  const lesson = await lessonFor(actor, courseId, stepId)
  const section = lesson.sections.find(x => x.id === sectionId)
  if (!section) refuse('training.section.not-found', 'There is no such section in this lesson.', { status: 404 })
  if (!section.open) refuse('training.section.not-open', 'Go through the sections before this one first.', { status: 409 })
  const person = await canonicalAccount(actor.accountId)
  const at = nowMs()
  const since = await windowStart(courseId, person)
  // Once per section; a reach from before the window or the last award is renewed (O1).
  unit.add({
    sql: `INSERT INTO training_lesson_progress (account_id, section_id, step_id, reached_at) VALUES (?1, ?2, ?3, ?4) /* not-policy: bound parameters */
      ON CONFLICT (account_id, section_id) DO UPDATE SET reached_at = excluded.reached_at WHERE training_lesson_progress.reached_at < ?5 /* not-policy: bound parameters */`,
    params: [person, sectionId, stepId, at, since],
  })
  const done = lesson.sections.every(x => x.reached || x.id === sectionId)
  if (!done || lesson.done) return { done: lesson.done || done, signOffId: null, recordId: null }
  const pending = addSignOff(unit, { accountId: person, courseId, stepId, kind: 'lesson', signedBy: null, occurredOn: await theatreDay(at) })
  return { done: true, signOffId: pending.id, recordId: await evaluateAward(unit, course, person, [pending]) }
}
