// A template of custom fields for the forms tests, suited to the record-mode slot gallery.show-fields.
export default {
  key: 'gallery.show-fields',
  name: 'gallery.forms.fields-template.name',
  description: 'gallery.forms.fields-template.description',
  mode: 'record',
  slots: ['gallery.show-fields'],
  definition: {
    format: 1,
    pages: [{
      id: 'page-1',
      title: '',
      items: [
        { kind: 'question', id: 'running-time', key: 'running_time', type: 'number', label: 'Running time in minutes', dataClass: 'public' },
        { kind: 'question', id: 'interval', key: 'interval', type: 'yesno', label: 'Is there an interval?', dataClass: 'public' },
      ],
    }],
  },
}
