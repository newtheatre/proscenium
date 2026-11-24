// A fixture for person-busy (C-66): it requires the support module person-busy, so switching it on
// brings person-busy on, and it reports crew calls to core.person-busy as each test sets them.
import { defineModule } from '#kit'

export default defineModule({
  id: 'crewcall',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['person-busy'],
  contributes: { 'core.person-busy': [{ id: 'crewcall' }] },
})
