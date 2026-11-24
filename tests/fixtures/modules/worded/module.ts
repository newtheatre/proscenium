// A fixture for core.public-wording (C-67): two contributors, each applying only while the test says
// so through worded/server/state.ts, so the first-wins rule and the health warning can be tested.
import { defineModule } from '#kit'

export default defineModule({
  id: 'worded',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  contributes: {
    'core.public-wording': [{ id: 'worded.events', file: 'events' }, { id: 'worded.acts', file: 'acts' }],
  },
})
