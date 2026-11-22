// A load that fails in a way trying again could put right, for the gallery's failed-load example.
import { defineRoute, refuse } from '#kit'

export default defineRoute({ ability: 'gallery.sample.view', rateLimit: 'default' }, async () => {
  refuse('gallery.sample.unavailable', 'The sample service is not answering.', { status: 503 })
})
