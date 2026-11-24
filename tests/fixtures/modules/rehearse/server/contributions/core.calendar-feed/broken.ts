// A calendar feed contributor that fails while the test asks it to (CF6).
import type { CalendarFeed } from '#modules/core'
import { broken } from './calls'

export default {
  async events() {
    if (broken.failing) throw new Error('rehearse.broken failed on purpose')
    return []
  },
} satisfies CalendarFeed
