// A sample outcome action for the forms browser test: it writes an audit entry on the response naming the show it
// was about, so the test can see that it ran, and ran once.
import type { OutcomeAction } from '../../../../../../../layers/forms/server/points/outcome-action'

export default {
  key: 'gallery.note',
  label: 'gallery.forms.note.label',
  slot: 'gallery.show-feedback',
  inputs: [{ key: 'title', label: 'gallery.forms.note.title', required: true, types: ['text.short'] }],
  async run(unit, call) {
    unit.audit({ action: 'update', record: ['forms.response', call.response.id], detail: { noted: call.response.subjectId, title: call.input.title?.text.length ?? 0 } })
  },
} satisfies OutcomeAction
