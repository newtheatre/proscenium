// training.course-trainer (part 6): listed as a trainer of the course in hand, in one keyed read over
// the account scope. A session or a training record is judged by its course.
import { all, defineFact, first } from '#kit'
import { accountScopeSql } from '#kit/accounts'

async function courseOf(record?: { type: string, id: string }): Promise<string | null> {
  if (!record) return null
  if (record.type === 'training.course') return record.id
  if (record.type === 'training.session') return (await first<{ id: string }>('SELECT course_id AS id FROM training_sessions WHERE id = ?', record.id))?.id ?? null
  if (record.type === 'training.record') return (await first<{ id: string }>('SELECT course_id AS id FROM training_records WHERE id = ?', record.id))?.id ?? null
  return null
}

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  const courseId = await courseOf(record)
  if (!courseId) return false
  return !!await first(`SELECT 1 FROM training_course_trainers WHERE course_id = ?1 AND account_id IN (${accountScopeSql('?2')})`, courseId, actor.accountId)
}, {
  holders: async (record) => {
    const courseId = await courseOf(record)
    const rows = await all<{ id: string }>(
      `SELECT DISTINCT coalesce(a.merged_into_id, t.account_id) AS id FROM training_course_trainers t LEFT JOIN core_accounts a ON a.id = t.account_id
        ${courseId ? 'WHERE t.course_id = ?' : ''}`,
      ...(courseId ? [courseId] : []),
    )
    return rows.map(r => r.id)
  },
})
