// Evidence is named by its course only, never by the person it is about.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string, course_id: string }>('SELECT c.title, e.course_id FROM training_evidence e JOIN training_courses c ON c.id = e.course_id WHERE e.id = ?', id)
    return row ? { title: `Evidence for ${row.title}`, to: '/console/training/evidence', parent: { type: 'training.course', id: row.course_id } } : null
  },
}
