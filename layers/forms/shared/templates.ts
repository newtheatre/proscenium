// The templates the platform ships (FB-208): each a complete, working form that needs only a link.
// A form made from one is a copy and owes it nothing afterwards. Their names and descriptions are
// translation keys; what the questions say is the starting wording, which the theatre makes its own.
import { FORMAT, type Definition, type Question } from './engine/types'
import { reviewWorkflow } from './engine/workflow'

export interface ShippedTemplate {
  key: string
  /** Translation keys. */
  name: string
  description: string
  /** The form starts out anonymous. */
  anonymous?: boolean
  definition: Definition
}

const q = (id: string, type: Question['type'], label: string, more: Partial<Question> = {}): Question => ({ kind: 'question', id, key: id.replace(/-/g, '_'), type, label, dataClass: 'internal', ...more })

const showProposal: Definition = {
  format: FORMAT,
  pages: [
    {
      id: 'page-show',
      title: 'The show',
      items: [
        q('title', 'text.short', 'What is the show called?', { required: true }),
        q('writer', 'text.short', 'Who wrote it?'),
        q('synopsis', 'text.long', 'Tell us about it', { help: 'A few paragraphs on the story and why you want to stage it.', required: true, dataClass: 'free-text' }),
        q('cast-size', 'number', 'How many are in the cast?', { validation: [{ rule: 'whole' }, { rule: 'min', value: 1 }] }),
      ],
    },
    {
      id: 'page-team',
      title: 'Your team',
      items: [
        {
          kind: 'group', id: 'team-members', key: 'team', label: 'Who is on the team so far?', min: 1, max: 12, // not-policy: a starting value the theatre edits
          items: [
            q('member-name', 'text.short', 'Name', { required: true, dataClass: 'personal' }),
            q('member-role', 'text.short', 'Role', { help: 'Director, producer, designer and so on.', required: true }),
          ],
        },
      ],
    },
    {
      id: 'page-budget',
      title: 'Budget',
      help: 'Rough figures are fine.',
      items: [
        q('rights', 'money', 'Performing rights'),
        q('set', 'money', 'Set and props'),
        q('costume', 'money', 'Costume'),
        q('other-costs', 'money', 'Anything else'),
      ],
    },
  ],
  calculations: [
    { id: 'total', key: 'total', type: 'money', expression: { fn: 'add', args: [{ answer: 'rights' }, { answer: 'set' }, { answer: 'costume' }, { answer: 'other-costs' }] } },
  ],
  workflow: reviewWorkflow({ received: 'Received', review: 'Being considered', returned: 'Returned for changes', approved: 'Accepted', declined: 'Not this time', start: 'Start considering', back: 'Return for changes', resubmit: 'Send changes', approve: 'Accept', decline: 'Decline' }),
}

const accessRequirements: Definition = {
  format: FORMAT,
  pages: [
    {
      id: 'page-visit',
      title: 'Your visit',
      help: 'What you tell us here is seen only by the people who arrange access.',
      items: [
        q('name', 'text.short', 'Your name', { required: true, dataClass: 'personal' }),
        q('needs', 'choice.multiple', 'What would help?', {
          dataClass: 'special',
          allowOther: true,
          options: [
            { id: 'step-free', label: 'Step-free access' },
            { id: 'wheelchair', label: 'A wheelchair space' },
            { id: 'hearing', label: 'A hearing loop' },
            { id: 'captions', label: 'A captioned performance' },
            { id: 'bsl', label: 'A BSL-interpreted performance' },
            { id: 'companion', label: 'A seat for a companion' },
          ],
        }),
        q('details', 'text.long', 'Anything else we should know?', { dataClass: 'special' }),
        q('contact', 'yesno', 'Would you like us to get in touch before your visit?'),
        q('phone', 'phone', 'The best number to reach you on', { dataClass: 'personal', visibleWhen: { left: { answer: 'contact' }, op: 'is', right: { value: true } } }),
      ],
    },
  ],
}

const feedbackSurvey: Definition = {
  format: FORMAT,
  pages: [
    {
      id: 'page-visit',
      title: 'Your visit',
      items: [
        q('overall', 'rating', 'How was your visit overall?', { required: true, scale: { max: 5 } }), // not-policy: a five-star rating
        q('heard', 'choice.single', 'How did you hear about the show?', {
          allowOther: true,
          options: [
            { id: 'friend', label: 'From a friend or somebody in it' },
            { id: 'social', label: 'Social media' },
            { id: 'poster', label: 'A poster or flyer' },
            { id: 'email', label: 'An email from us' },
          ],
        }),
        q('again', 'yesno', 'Would you come again?'),
        q('comments', 'text.long', 'Anything you would like to tell us?', { dataClass: 'free-text' }),
      ],
    },
  ],
  presentation: { confirmation: 'Thank you. Your answers help us do better.' },
}

export const SHIPPED_TEMPLATES: ShippedTemplate[] = [
  { key: 'forms.show-proposal', name: 'forms.templates.show-proposal.name', description: 'forms.templates.show-proposal.description', definition: showProposal },
  { key: 'forms.access-requirements', name: 'forms.templates.access-requirements.name', description: 'forms.templates.access-requirements.description', definition: accessRequirements },
  { key: 'forms.feedback-survey', name: 'forms.templates.feedback-survey.name', description: 'forms.templates.feedback-survey.description', anonymous: true, definition: feedbackSurvey },
]
