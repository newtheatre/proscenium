// Awards' template on forms.template: a nomination form ready for the slot awards.nomination, with
// the approving move already set to issue the award (awards.issue-award) to the person named. The
// award type is the record the form is attached to, so the form does not ask which award. Awards
// imports nothing from forms: the definition is plain data in forms' definition format (1).
const q = (id: string, type: string, label: string, more: Record<string, unknown> = {}) => ({ kind: 'question', id, key: id.replace(/-/g, '_'), type, label, dataClass: 'internal', ...more })

export default {
  key: 'awards.nomination',
  name: 'awards.forms.nomination-template.name',
  description: 'awards.forms.nomination-template.description',
  slots: ['awards.nomination'],
  definition: {
    format: 1,
    pages: [
      {
        id: 'page-nomination',
        title: 'Your nomination',
        items: [
          q('nominee', 'record', 'Who are you nominating?', { source: 'core.person', required: true, dataClass: 'personal', peopleInvolved: true }),
          q('for', 'text.short', 'What is it for?', { help: 'A few words, such as "Twenty years backstage".' }),
          q('why', 'text.long', 'Why do they deserve it?', { help: 'This may be read out as the citation.', required: true, dataClass: 'free-text' }),
        ],
      },
    ],
    workflow: {
      stages: [
        { key: 'received', name: 'Received', kind: 'pending' },
        { key: 'considering', name: 'Being considered', kind: 'in_review' },
        { key: 'approved', name: 'Awarded', kind: 'approved' },
        { key: 'declined', name: 'Not this time', kind: 'declined' },
      ],
      transitions: [
        { key: 'consider', from: 'received', to: 'considering', label: 'Start considering', who: 'staff' },
        { key: 'approve', from: 'considering', to: 'approved', label: 'Give the award', who: 'staff', actions: [{ id: 'issue_award', action: 'awards.issue-award', map: { nominee: 'nominee', awardedFor: 'for', citation: 'why' } }] },
        { key: 'decline', from: 'considering', to: 'declined', label: 'Decline', who: 'staff' },
      ],
    },
    presentation: { submitLabel: 'Send the nomination', confirmation: 'Thank you. The committee will consider your nomination.' },
  },
}
