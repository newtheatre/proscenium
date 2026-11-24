// A training record is named by its course only, never by the person it is about.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string, course_id: string }>('SELECT c.title, r.course_id FROM training_records r JOIN training_courses c ON c.id = r.course_id WHERE r.id = ?', id)
    return row ? { title: row.title, to: `/console/training/courses/${row.course_id}`, parent: { type: 'training.course', id: row.course_id } } : null
  },
}
