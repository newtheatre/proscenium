import { defineRoute } from '#kit'

export default defineRoute({ ability: 'gallery.sample.view', rateLimit: 'default' }, async () => ({
  values: { name: 'Hamlet (renamed)', email: 'box.office@example.org', quantity: 4, notes: 'Their notes' },
  version: 'fresh',
}))
