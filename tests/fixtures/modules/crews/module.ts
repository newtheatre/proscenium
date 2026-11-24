// A fixture for availability.group: crews whose members and planners each test sets, so the
// Availability tests can plan through a group without the Productions module.
import { defineModule } from '#kit'

export default defineModule({
  id: 'crews',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['availability'],
  contributes: { 'availability.group': [{ id: 'crews' }] },
})
