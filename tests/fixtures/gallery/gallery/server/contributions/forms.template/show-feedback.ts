// A template for the forms browser and integration tests: feedback on a sample show, suited to the
// slot gallery.show-feedback.
export default {
  key: 'gallery.show-feedback',
  name: 'gallery.forms.feedback-template.name',
  description: 'gallery.forms.feedback-template.description',
  slots: ['gallery.show-feedback'],
  definition: {
    format: 1,
    pages: [{
      id: 'page-1',
      title: '',
      items: [
        { kind: 'question', id: 'liked', key: 'liked', type: 'yesno', label: 'Did you enjoy the show?', dataClass: 'internal', required: true },
        { kind: 'question', id: 'comment', key: 'comment', type: 'text.long', label: 'Tell us more', dataClass: 'free-text' },
      ],
    }],
  },
}
