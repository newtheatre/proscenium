// Competencies, their routes and the verdict hosts ask for (TR-22, TR-23, TR-35 to TR-37, TR-50; R1 to R11).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { advanceClock, can, fact, factHolders, requirements, type Actor } from '#kit'
import { setAccessProvider } from '#kit/access'
import { inContext, rows, testAccess } from '../../../../tests/integration/helpers'
import { pinnedFactAbilityMap } from '../../../core/server/identity/grants'
import { DAY, liveCourse, MANAGER, ready, req, someone, today } from './stage'

beforeEach(ready)

/** A learner given a training record for a course by direct award, lasting the days given. */
async function trained(manager: Actor, learner: Actor, courseId: string, days = 30): Promise<string> {
  const expiresOn = new Date(Date.now() + days * DAY).toISOString().slice(0, 10)
  const made = await req(manager, 'POST', `/api/training/courses/${courseId}/awards`, { accountId: learner.accountId, reason: 'Trained elsewhere', expiresOn })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.recordId
}

async function competency(manager: Actor, title: string, routes: unknown[]): Promise<string> {
  const made = await req(manager, 'POST', '/api/training/competencies', { title })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const saved = await req(manager, 'PUT', `/api/training/competencies/${made.body.competencyId}/routes`, { routes })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  const on = await req(manager, 'POST', `/api/training/competencies/${made.body.competencyId}/activate`, {})
  expect(on.status, JSON.stringify(on.body)).toBe(200)
  return made.body.competencyId
}

const check = (accounts: string[], refs: string[], at?: number) =>
  inContext(() => requirements.check({ accounts, refs, at, whenUnavailable: 'met' }))

/** A site role held by the account, for a recognised item `core.role:<id>`. */
async function role(name: string, holder?: Actor): Promise<string> {
  const id = `rol_${name.toLowerCase().replace(/\W/g, '')}000000000000000`.slice(0, 30)
  await rows('INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (?, ?, ?, 0, 0, 0, \'none\', 0)', id, name.toLowerCase(), name)
  if (holder) await rows('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', 0, ?, 0)', `gra_${id.slice(4)}`, holder.accountId, id, holder.accountId)
  return id
}

describe('making a competency (TR-35; R1, R9)', () => {
  it('stays retired until it has an active route with an item, and refuses losing its last route', async () => {
    const manager = await someone(MANAGER)
    const { courseId } = await liveCourse(manager)
    const made = await req(manager, 'POST', '/api/training/competencies', { title: 'Duty manager' })
    const id = made.body.competencyId
    expect((await req(manager, 'POST', `/api/training/competencies/${id}/activate`, {})).body.code).toBe('training.competency.no-route')
    await req(manager, 'PUT', `/api/training/competencies/${id}/routes`, { routes: [{ label: 'Our course', items: [] }] })
    expect((await req(manager, 'POST', `/api/training/competencies/${id}/activate`, {})).body.code).toBe('training.competency.no-route')

    await req(manager, 'PUT', `/api/training/competencies/${id}/routes`, { routes: [{ label: 'Our course', items: [{ kind: 'course', courseId }] }] })
    expect((await req(manager, 'POST', `/api/training/competencies/${id}/activate`, {})).status).toBe(200)
    const emptied = await req(manager, 'PUT', `/api/training/competencies/${id}/routes`, { routes: [] })
    expect(emptied.status).toBe(422)
    expect(emptied.body.code).toBe('training.competency.no-route')

    const shown = await req(manager, 'GET', `/api/training/competencies/${id}`)
    expect(shown.body.competency).toMatchObject({ title: 'Duty manager', slug: 'duty-manager', status: 'active' })
    // A route saved without its id is a new route; the one it replaced is kept, retired (R9).
    expect(shown.body.routes).toEqual([
      expect.objectContaining({ label: 'Our course', status: 'active', items: [expect.objectContaining({ kind: 'course', courseId })] }),
      expect.objectContaining({ label: 'Our course', status: 'retired', items: [] }),
    ])
  })

  it('answers holders before and after a change, retires a route left out, and audits it', async () => {
    const manager = await someone(MANAGER)
    const learner = await someone(['training.course.view'])
    const a = await liveCourse(manager)
    const b = await liveCourse(manager)
    await trained(manager, learner, a.courseId)
    const id = await competency(manager, 'Lighting desk', [{ label: 'Course A', items: [{ kind: 'course', courseId: a.courseId }] }])
    const [first] = (await req(manager, 'GET', `/api/training/competencies/${id}`)).body.routes

    const changed = await req(manager, 'PUT', `/api/training/competencies/${id}/routes`, { routes: [{ label: 'Course B', items: [{ kind: 'course', courseId: b.courseId }] }] })
    expect(changed.body.holders).toEqual({ before: 1, after: 0 })
    const routes = await rows<any>('SELECT id, label, status, position FROM training_competency_routes WHERE competency_id = ? ORDER BY position', id)
    expect(routes).toEqual([expect.objectContaining({ label: 'Course B', status: 'active', position: 1 }), expect.objectContaining({ id: first.id, status: 'retired', position: 2 })])
    expect(await rows('SELECT 1 FROM core_events WHERE name = \'training.competency.routes-changed\' AND record_id = ?', id)).toHaveLength(2)
    expect(await rows('SELECT 1 FROM core_audit WHERE record_type = \'training.competency\' AND record_id = ?', id)).not.toHaveLength(0)

    const learnerView = await req(learner, 'GET', `/api/training/competencies/${id}`)
    expect(learnerView.body.routes).toHaveLength(1)
    expect(learnerView.body.holders).toBeNull()
  })

  it('refuses a recognised item that names Training (R7) and needs competency.manage', async () => {
    const manager = await someone(MANAGER)
    const other = await someone(['training.course.manage', 'training.course.view'])
    const made = await req(manager, 'POST', '/api/training/competencies', { title: 'Rigger' })
    const loop = await req(manager, 'PUT', `/api/training/competencies/${made.body.competencyId}/routes`, { routes: [{ label: 'Loop', items: [{ kind: 'recognised', requirementRef: `training:${made.body.competencyId}` }] }] })
    expect(loop.status).toBe(422)
    expect(loop.body.code).toBe('training.route.self-reference')
    const fact = await req(manager, 'PUT', `/api/training/competencies/${made.body.competencyId}/routes`, { routes: [{ label: 'Loop', items: [{ kind: 'recognised', requirementRef: 'fact:training.competent' }] }] })
    expect(fact.body.code).toBe('training.route.self-reference')
    expect((await req(other, 'POST', '/api/training/competencies', { title: 'Nope' })).status).toBe(403)
  })
})

describe('the verdict hosts ask for (TR-23, TR-36; R2 to R5, R11)', () => {
  it('is met through any held route, until the latest held route lapses, naming the first held route', async () => {
    const manager = await someone(MANAGER)
    const learner = await someone()
    const a = await liveCourse(manager)
    const b = await liveCourse(manager)
    const c = await liveCourse(manager)
    await trained(manager, learner, a.courseId, 10)
    await trained(manager, learner, b.courseId, 40)
    await trained(manager, learner, c.courseId, 100)
    // Route two needs b and c, so it lasts as long as b (R4); route one lasts as long as a.
    const id = await competency(manager, 'First aider', [
      { label: 'our First aid course', items: [{ kind: 'course', courseId: a.courseId }] },
      { label: 'both refreshers', items: [{ kind: 'course', courseId: b.courseId }, { kind: 'course', courseId: c.courseId }] },
    ])
    const [now] = await check([learner.accountId!], [`training:${id}`])
    expect(now).toMatchObject({ verdict: 'met', unavailable: false })
    const lastOfB = Date.parse(`${new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10)}T23:59:59.999Z`)
    expect(now!.until).toBe(lastOfB)
    expect(now!.summary).toContain('through our First aid course')

    // After a lapses, b and c still hold it through route two.
    const [later] = await check([learner.accountId!], [`training:${id}`], Date.now() + 20 * DAY)
    expect(later).toMatchObject({ verdict: 'met' })
    expect(later!.summary).toContain('through both refreshers')
    const [after] = await check([learner.accountId!], [`training:${id}`], Date.now() + 50 * DAY)
    expect(after!.verdict).toBe('not-met')
    // The nearer route (one of two items held) is offered first, with what lapsed.
    expect(after!.reason).toMatch(/^Not met\. You could hold First aider by: both refreshers \(Course \d+ lapsed on .+\); or our First aid course \(Course \d+ lapsed on .+\)\.$/)
    expect(after!.help).toBe('/members/training/competencies/first-aider')
  })

  it('answers for the past and the future, and unavailable for a retired competency', async () => {
    const manager = await someone(MANAGER)
    const learner = await someone()
    const a = await liveCourse(manager)
    const id = await competency(manager, 'Box office', [{ label: 'Course', items: [{ kind: 'course', courseId: a.courseId }] }])
    const before = Date.now() - DAY
    await trained(manager, learner, a.courseId)
    expect((await check([learner.accountId!], [`training:${id}`], before))[0]!.verdict).toBe('not-met')
    expect((await check([learner.accountId!], [`training:${id}`]))[0]!.verdict).toBe('met')
    await req(manager, 'POST', `/api/training/competencies/${id}/retire`, {})
    expect((await check([learner.accountId!], [`training:${id}`]))[0]).toMatchObject({ verdict: 'met', unavailable: true })
    const strict = await inContext(() => requirements.check({ accounts: [learner.accountId!], refs: [`training:${id}`], whenUnavailable: 'not-met' }))
    expect(strict[0]).toMatchObject({ verdict: 'not-met', unavailable: true })
  })

  it('holds through a recognised item asked of another source, and offers it when not held (R2, R6, TR-37)', async () => {
    const manager = await someone(MANAGER)
    const volunteer = await someone([], 'Val Volunteer')
    const nobody = await someone([], 'Nora Nobody')
    const { courseId } = await liveCourse(manager)
    const roleId = await role('St John volunteer', volunteer)
    const id = await competency(manager, 'Medic', [
      { label: 'our course', items: [{ kind: 'course', courseId }] },
      { label: 'being a St John volunteer', items: [{ kind: 'recognised', requirementRef: `core.role:${roleId}` }] },
    ])
    const answers = await check([volunteer.accountId!, nobody.accountId!], [`training:${id}`])
    expect(answers.find(a => a.account === volunteer.accountId)).toMatchObject({ verdict: 'met' })
    expect(answers.find(a => a.account === volunteer.accountId)!.summary).toContain('through being a St John volunteer')
    const no = answers.find(a => a.account === nobody.accountId)!
    expect(no.verdict).toBe('not-met')
    expect(no.reason).toContain('being a St John volunteer (not recorded)')

    const shown = await req(manager, 'GET', `/api/training/competencies/${id}`)
    expect(shown.body.routes[1].items[0]).toMatchObject({ kind: 'recognised', label: 'Holds the role St John volunteer' })
  })

  it('counts a record held under a merged account', async () => {
    const manager = await someone(MANAGER)
    const old = await someone()
    const kept = await someone()
    const { courseId } = await liveCourse(manager)
    await trained(manager, old, courseId)
    await rows('UPDATE core_accounts SET merged_into_id = ? WHERE id = ?', kept.accountId, old.accountId)
    const id = await competency(manager, 'Sound desk', [{ label: 'Course', items: [{ kind: 'course', courseId }] }])
    expect((await check([kept.accountId!], [`training:${id}`]))[0]!.verdict).toBe('met')
  })
})

describe('the fact training.competent (R10)', () => {
  // Identity's pinned mappings, read from the table, on the tests' access provider.
  beforeEach(() => setAccessProvider({ ...testAccess, pinnedFactAbilities: pinnedFactAbilityMap }))
  afterEach(() => setAccessProvider(testAccess))

  it('holds for the competency in hand exactly when the verdict is met, and lists holders', async () => {
    const manager = await someone(MANAGER)
    const learner = await someone()
    const other = await someone()
    const { courseId } = await liveCourse(manager)
    await trained(manager, learner, courseId, 5)
    const id = await competency(manager, 'Workshop', [{ label: 'Induction', items: [{ kind: 'course', courseId }] }])
    await rows('INSERT INTO core_fact_abilities (fact, ability, pinned_record, created_by, created_at) VALUES (\'training.competent\', \'training.course.view\', ?, ?, 0)', id, manager.accountId)
    expect((await inContext(() => can(learner, 'training.course.view', ['training.competency', id]))).allowed).toBe(true)
    expect((await inContext(() => can(other, 'training.course.view', ['training.competency', id]))).allowed).toBe(false)
    expect(await inContext(() => factHolders('training.competent', { type: 'training.competency', id }))).toEqual([learner.accountId])
    advanceClock(10 * DAY)
    expect((await inContext(() => can(learner, 'training.course.view', ['training.competency', id]))).allowed).toBe(false)
    expect(await inContext(() => fact('training.competent', learner, { type: 'training.competency', id }))).toBe(false)
  })
})

describe('the learner\'s page (TR-50; M13)', () => {
  it('lists each active route with progress per item', async () => {
    const manager = await someone(MANAGER)
    const learner = await someone()
    const a = await liveCourse(manager)
    const b = await liveCourse(manager)
    await trained(manager, learner, a.courseId)
    await competency(manager, 'Stage manager', [{ label: 'Both courses', items: [{ kind: 'course', courseId: a.courseId }, { kind: 'course', courseId: b.courseId }] }])
    const page = await req(learner, 'GET', '/api/training/me/competencies/stage-manager')
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body).toMatchObject({ held: false, routes: [{ label: 'Both courses', held: false, items: [expect.objectContaining({ held: true }), expect.objectContaining({ held: false, until: null })] }] })
    await trained(manager, learner, b.courseId)
    expect((await req(learner, 'GET', '/api/training/me/competencies')).body.competencies).toEqual([expect.objectContaining({ heldBy: 'Both courses' })])
    expect((await req(learner, 'GET', '/api/training/me/competencies/nothing')).status).toBe(404)
  })
})

void today
