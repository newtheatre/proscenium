// Sales for the rows of one page of the sample shows list, from the same address the list was read with.
import { defineRoute } from '#kit'

export default defineRoute({ ability: 'gallery.sample.view', rateLimit: 'default' }, () => {
  return { sold: { 'show-1': 84, 'show-2': 40, 'show-3': 0, 'show-4': 120, 'show-5': 0 } }
})
