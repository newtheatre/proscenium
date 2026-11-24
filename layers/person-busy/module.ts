// Person-busy (C-66): the one read of whether people are committed elsewhere, merging every
// core.person-busy contribution. A support module (C-65, R3-26 Q11): on while a module requiring it is on.
import { defineModule } from '#kit'

export default defineModule({
  id: 'person-busy',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  support: true,
})
