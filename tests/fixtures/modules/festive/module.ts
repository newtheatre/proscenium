// A fixture for the public-site points a festival uses (C-69, C-71 to C-73, C-75): each contribution
// applies only while the test says so, through festive/server/state.ts.
import { defineModule } from '#kit'

export default defineModule({
  id: 'festive',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  uses: ['public-site'],
  contributes: {
    'public-site.production-section': [{ id: 'festive.works', file: 'works' }],
    'public-site.venue-section': [{ id: 'festive.in-festival', file: 'in-festival' }],
    'public-site.front-page': [{ id: 'festive.front', file: 'front' }],
    'public-site.menu': [{ id: 'festive.menu', file: 'menu' }],
    'public-site.production-address': [{ id: 'festive.events', file: 'events' }],
    'core.public-lines': [{ id: 'festive.billing', file: 'billing' }],
  },
})
