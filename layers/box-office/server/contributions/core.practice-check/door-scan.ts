// The door practice's tasks (BO-77): five tickets in, a booking let in from the list by name, the
// booking for tomorrow turned away, and the unpaid no-shows released. Turning someone away and
// finding them by name leave no row of their own, so those two read what the door answered.
import { all, definePracticeChecks, type PracticeAnswer } from '#kit'

const said = (answer: PracticeAnswer | undefined, path: RegExp) => !!answer && path.test(answer.path) ? answer.body as Record<string, unknown> | null : null
const count = async (sql: string, ...params: unknown[]) => (await all<{ n: number }>(sql, ...params))[0]?.n ?? 0

export default definePracticeChecks({
  'admit-five': async ({ results }) =>
    await count("SELECT count(*) AS n FROM box_office_scans WHERE performance_id = ? AND result = 'admitted'", results.tonight) >= 5, // not-policy: the task's five
  'by-name': ({ answer }) => Number(said(answer, /\/door\/admit$/)?.admitted ?? 0) > 0,
  'refuse-tomorrow': ({ answer, results }) => {
    const body = said(answer, /\/scan$/)
    return body?.result === 'wrong_performance' && body.ticketPerformanceId === results.tomorrow
  },
  'release-unpaid': async ({ results }) =>
    await count(`SELECT count(*) AS n FROM box_office_orders WHERE state = 'reserved'
      AND id IN (SELECT order_id FROM box_office_order_lines WHERE performance_id = ? AND kind = 'ticket' AND state = 'live')`, results.tonight) === 0,
})
