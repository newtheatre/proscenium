// Whether people hold competencies at an instant (amended part 3, R2 to R11; TR-23, TR-36). A
// competency holds when any of its active routes holds; a route holds when every item does: a
// course item by a training record current at the instant, a recognised item by asking the kit.
// Nothing is stored: the same rows answer for now, the future and the past.
import { all, nowMs, requirements, theatreTimeZone } from '#kit'

export interface Verdict {
  account: string
  competencyId: string
  met: boolean
  /** When a met verdict stops being met; null when nothing it rests on lapses. */
  until: number | null
  /** The route held by, first by position (R11), or on a not-met verdict the routes to offer (R5). */
  heldBy: string | null
  reason: string | null
  summary: string
  help: string
}

interface RouteItem { competencyId: string, competencyTitle: string, slug: string, routeId: string, label: string, position: number, kind: 'course' | 'recognised', courseId: string | null, courseTitle: string | null, ref: string | null }

/** Every active route item of the competencies asked about, in order (query one of two). */
async function itemsOf(competencyIds: string[]): Promise<RouteItem[]> {
  return all<RouteItem>(
    `SELECT c.id AS competencyId, c.title AS competencyTitle, c.slug, r.id AS routeId, r.label, r.position, i.kind, i.course_id AS courseId, co.title AS courseTitle, i.requirement_ref AS ref
       FROM training_competencies c
       JOIN training_competency_routes r ON r.competency_id = c.id AND r.status = 'active'
       JOIN training_route_items i ON i.route_id = r.id
       LEFT JOIN training_courses co ON co.id = i.course_id
      WHERE c.id IN (SELECT value FROM json_each(?1)) AND c.status = 'active'
      ORDER BY c.id, r.position, i.position`,
    JSON.stringify(competencyIds),
  )
}

interface Held { asked: string, courseId: string, until: number | null, endedLapsed: number | null }

/**
 * For each account asked about and each course, whether a training record covers the instant and
 * until when, read over the account scope; two merged accounts holding one course give the later
 * expiry (C1, C7). Also the latest expiry already passed, for the reason (query two of two).
 */
async function coursesHeld(accountIds: string[], courseIds: string[], at: number): Promise<{ held: Map<string, number | null>, lapsed: Map<string, number> }> {
  const held = new Map<string, number | null>()
  const lapsed = new Map<string, number>()
  if (!accountIds.length || !courseIds.length) return { held, lapsed }
  const rows = await all<Held & { current: number }>(
    `SELECT asked.value AS asked, r.course_id AS courseId, r.expires_at AS until,
            (r.awarded_at <= ?3 AND (r.ended_at IS NULL OR r.ended_at > ?3) AND (r.expires_at IS NULL OR r.expires_at >= ?3)) AS current /* not-policy: bound parameters */
       FROM json_each(?1) asked
       JOIN core_accounts a ON a.id = asked.value
       JOIN core_accounts held ON coalesce(held.merged_into_id, held.id) = coalesce(a.merged_into_id, a.id)
       JOIN training_records r ON r.account_id = held.id
      WHERE r.course_id IN (SELECT value FROM json_each(?2)) AND r.awarded_at <= ?3 AND r.status != 'revoked' /* not-policy: bound parameters */`,
    JSON.stringify(accountIds), JSON.stringify(courseIds), at,
  )
  for (const row of rows) {
    const key = `${row.asked}\u0000${row.courseId}`
    if (row.current) {
      const before = held.get(key)
      held.set(key, before === null || row.until === null ? null : Math.max(before ?? 0, row.until))
    }
    else if (row.until !== null && row.until < at) {
      lapsed.set(key, Math.max(lapsed.get(key) ?? 0, row.until))
    }
  }
  return { held, lapsed }
}

const dayOf = (ms: number, timeZone: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone }).format(ms)

/**
 * The verdict for every pair of account and competency at one instant (R8): two queries of
 * Training's own tables, plus one kit call per recognised source for pairs no course route holds.
 */
export async function verdicts(accountIds: string[], competencyIds: string[], at = nowMs()): Promise<Verdict[]> {
  const accounts = [...new Set(accountIds)]
  const asked = [...new Set(competencyIds)]
  const items = await itemsOf(asked)
  const courseIds = [...new Set(items.filter(i => i.courseId).map(i => i.courseId!))]
  const { held, lapsed } = await coursesHeld(accounts, courseIds, at)
  const timeZone = await theatreTimeZone()

  const byCompetency = new Map<string, Map<string, RouteItem[]>>()
  for (const item of items) {
    const routes = byCompetency.get(item.competencyId) ?? new Map<string, RouteItem[]>()
    routes.set(item.routeId, [...routes.get(item.routeId) ?? [], item])
    byCompetency.set(item.competencyId, routes)
  }

  // A course item's answer, or undefined for a recognised one still to ask.
  const courseAnswer = (account: string, item: RouteItem) => {
    const key = `${account}\u0000${item.courseId}`
    return held.has(key) ? { met: true, until: held.get(key)! } : { met: false, until: null }
  }
  const routeByCourses = (account: string, route: RouteItem[]) => route.every(i => i.kind === 'course' && courseAnswer(account, i).met)

  // Recognised items, asked only where no route made of courses alone already holds (R8).
  const toAsk = new Map<string, Set<string>>()
  for (const account of accounts) {
    for (const routes of byCompetency.values()) {
      if ([...routes.values()].some(route => routeByCourses(account, route))) continue
      for (const route of routes.values()) for (const i of route) if (i.kind === 'recognised') toAsk.set(i.ref!, (toAsk.get(i.ref!) ?? new Set()).add(account))
    }
  }
  const recognised = new Map<string, { met: boolean, until: number | null }>()
  if (toAsk.size) {
    const answers = await requirements.check({ accounts: [...new Set([...toAsk.values()].flatMap(s => [...s]))], refs: [...toAsk.keys()], at, whenUnavailable: 'not-met' })
    for (const a of answers) recognised.set(`${a.account}\u0000${a.ref}`, { met: a.verdict === 'met' && !a.unavailable, until: a.until ?? null })
  }
  const itemAnswer = (account: string, item: RouteItem) => item.kind === 'course' ? courseAnswer(account, item) : recognised.get(`${account}\u0000${item.ref}`) ?? { met: false, until: null }

  const out: Verdict[] = []
  for (const account of accounts) {
    for (const competencyId of asked) {
      const routes = [...(byCompetency.get(competencyId)?.values() ?? [])]
      const title = routes[0]?.[0]?.competencyTitle ?? null
      const help = `/members/training/competencies/${routes[0]?.[0]?.slug ?? competencyId}`
      if (!routes.length) {
        out.push({ account, competencyId, met: false, until: null, heldBy: null, reason: 'This is not something anyone can hold at the moment.', summary: 'Not active.', help })
        continue
      }
      const judged = routes.map((route) => {
        const answers = route.map(i => ({ item: i, ...itemAnswer(account, i) }))
        const met = answers.every(a => a.met)
        // A held route lasts as long as its shortest-lived item (R4).
        const untils = answers.map(a => a.until)
        const until = met ? (untils.includes(null) && untils.every(u => u === null) ? null : Math.min(...untils.filter((u): u is number => u !== null))) : null
        return { route, answers, met, until, done: answers.filter(a => a.met).length }
      })
      const heldRoutes = judged.filter(j => j.met)
      if (heldRoutes.length) {
        // The latest-lasting held route decides until (R4); the first by position names it (R11).
        const until = heldRoutes.some(j => j.until === null) ? null : Math.max(...heldRoutes.map(j => j.until!))
        const by = heldRoutes[0]!.route[0]!.label
        out.push({ account, competencyId, met: true, until, heldBy: by, reason: null, summary: `${title}: current${until === null ? '' : ` until ${dayOf(until, timeZone)}`}, through ${by}.`, help })
        continue
      }
      // Not held: up to three routes, the nearest first, each with what it lacks (R5).
      const offered = [...judged].sort((a, b) => b.done - a.done || a.route[0]!.position - b.route[0]!.position).slice(0, 3) // not-policy: R5 names at most three routes
      const lacks = offered.map(({ route, answers }) => {
        const missing = answers.filter(a => !a.met).map(({ item }) => {
          if (item.kind === 'recognised') return 'not recorded'
          const lapsedOn = lapsed.get(`${account}\u0000${item.courseId}`)
          return lapsedOn ? `${item.courseTitle} lapsed on ${dayOf(lapsedOn, timeZone)}` : `${item.courseTitle} needed`
        })
        return `${route[0]!.label} (${missing.join('; ')})`
      })
      out.push({ account, competencyId, met: false, until: null, heldBy: null, reason: `Not met. You could hold ${title} by: ${lacks.join('; or ')}.`, summary: `${title}: not held.`, help })
    }
  }
  return out
}

/** The competencies a person holds at an instant, each with until when. */
export async function competenciesOf(accountId: string, at = nowMs()): Promise<{ competencyId: string, until: number | null, heldBy: string | null }[]> {
  const ids = (await all<{ id: string }>('SELECT id FROM training_competencies WHERE status = \'active\'')).map(r => r.id)
  return (await verdicts([accountId], ids, at)).filter(v => v.met).map(v => ({ competencyId: v.competencyId, until: v.until, heldBy: v.heldBy }))
}

/**
 * The people who hold a competency at an instant, each once and as their surviving account. Read
 * from training records: a person holding it only through a recognised item is found when they
 * also hold a course of it, since another source cannot be asked who its holders are.
 */
export async function holdersOfCompetency(competencyId: string, at = nowMs()): Promise<string[]> {
  const candidates = await all<{ id: string }>(
    `SELECT DISTINCT coalesce(a.merged_into_id, r.account_id) AS id FROM training_records r
       LEFT JOIN core_accounts a ON a.id = r.account_id
      WHERE r.course_id IN (SELECT i.course_id FROM training_route_items i JOIN training_competency_routes t ON t.id = i.route_id WHERE t.competency_id = ?1 AND i.course_id IS NOT NULL)
        AND r.awarded_at <= ?2 AND (r.ended_at IS NULL OR r.ended_at > ?2) AND (r.expires_at IS NULL OR r.expires_at >= ?2)`,
    competencyId, at,
  )
  const found = await verdicts(candidates.map(c => c.id), [competencyId], at)
  return found.filter(v => v.met).map(v => v.account)
}
