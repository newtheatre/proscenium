// The night practice's tasks (FH-55): everyone on tonight's rota checked in (or marked as not coming),
// the opening checklist completed, and the night report signed off with a note written in it.
import { all, definePracticeChecks } from '#kit'

const count = async (sql: string, ...params: unknown[]) => (await all<{ n: number }>(sql, ...params))[0]?.n ?? 0
const TONIGHT = 'shift_id IN (SELECT id FROM front_of_house_shifts WHERE performance_id = ?)'

export default definePracticeChecks({
  'check-in': async ({ results }) =>
    await count(`SELECT count(*) AS n FROM front_of_house_assignments WHERE ${TONIGHT} AND checked_in_at IS NOT NULL`, results.tonight) > 0
    && await count(`SELECT count(*) AS n FROM front_of_house_assignments WHERE ${TONIGHT} AND checked_in_at IS NULL
      AND state NOT IN ('no_show', 'declined', 'withdrawn', 'released', 'removed')`, results.tonight) === 0,
  'opening-checklist': async ({ results }) =>
    await count("SELECT count(*) AS n FROM front_of_house_checklist_runs WHERE checklist_id = ? AND performance_id = ? AND state <> 'open'", results.checklist, results.tonight) > 0,
  'night-report': async ({ results }) =>
    await count(`SELECT count(*) AS n FROM front_of_house_night_reports r WHERE r.performance_id = ? AND r.state = 'signed_off'
      AND EXISTS (SELECT 1 FROM front_of_house_night_report_notes n WHERE n.report_id = r.id)`, results.tonight) > 0,
})
