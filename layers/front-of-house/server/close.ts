// The close-shifts task's work (part 3, "The shift window", rule 5): shifts past their window are
// completed; the people on a shift with no performance are resolved as worked, since no night report
// covers them; and a performance gets its draft report once its first window opens.
import { all, nowMs, type UnitView } from '#kit'
import { ensureDraft, resolvePeople } from './reports'

export async function closeShifts(unit: UnitView): Promise<{ completed: number, drafts: number }> {
  const at = nowMs()
  const ending = await all<{ id: string, performance_id: string | null }>(
    'SELECT id, performance_id FROM front_of_house_shifts WHERE state = \'published\' AND window_closes_at < ?', at)
  if (ending.length) {
    unit.add({ sql: 'UPDATE front_of_house_shifts SET state = \'completed\', updated_at = ? WHERE state = \'published\' AND id IN (SELECT value FROM json_each(?))', params: [at, JSON.stringify(ending.map(s => s.id))] })
    const occasions = ending.filter(s => !s.performance_id).map(s => s.id)
    if (occasions.length) await resolvePeople(unit, { shiftIds: occasions }, [], null)
  }
  const starting = await all<{ performance_id: string }>(
    `SELECT DISTINCT s.performance_id FROM front_of_house_shifts s
     WHERE s.performance_id IS NOT NULL AND s.state IN ('published', 'completed') AND s.window_opens_at <= ?
       AND NOT EXISTS (SELECT 1 FROM front_of_house_night_reports r WHERE r.performance_id = s.performance_id)`, at)
  for (const p of starting) ensureDraft(unit, p.performance_id)
  return { completed: ending.length, drafts: starting.length }
}
