// A stand-in for the Reports module, the one reader of figures per person (R3-27), until it is built.
import { ability, defineAbilities, defineModule } from '#kit'

export default defineModule({
  id: 'reports',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  abilities: defineAbilities('reports', {
    'people.view': ability({ risk: 'privileged', fresh: false, audit: 'read', grantAt: ['site'] }),
  }),
})
