// A members-side fixture that offers one figure per person, minutes on the rota, to Reports alone.
import { ability, defineAbilities, defineModule } from '#kit'

export default defineModule({
  id: 'rota',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  abilities: defineAbilities('rota', {
    'hours.view': ability({ on: 'core.production', risk: 'privileged', fresh: false, audit: 'read' }),
  }),
  contributes: {
    'core.privacy-record': [{ id: 'rota.hours', holds: 'The shifts you work', why: 'To thank and recognise volunteers', basis: 'Our legitimate interests', keptFor: 'Until you delete your account', order: 900 }],
    'core.person-measure': [{ id: 'rota.minutes', file: 'minutes' }],
  },
})
