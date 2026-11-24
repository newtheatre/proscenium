// A session is reached through its course; its title falls back to the course's.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ title: string, course_id: string }>('SELECT coalesce(s.title, c.title) AS title, s.course_id FROM training_sessions s JOIN training_courses c ON c.id = s.course_id WHERE s.id = ?', id)
    return row ? { title: row.title, to: `/console/training/sessions/${id}`, parent: { type: 'training.course', id: row.course_id } } : null
  },
}
