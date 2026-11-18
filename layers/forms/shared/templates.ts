// The templates the platform ships (FB-208): each a complete, working form that needs only a link.
// A form made from one is a copy and owes it nothing afterwards. Their names and descriptions are
// translation keys; what the questions say is the starting wording, which the theatre makes its own.
import { FORMAT, type Definition, type Question } from './engine/types'
import { reviewWorkflow } from './engine/workflow'
import { parseDefinition } from './engine/definition'
import { checkDefinition } from './engine/checks'

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

/** A template another module ships, through the point forms.template (server/points/template.ts). */
export interface ContributedTemplate extends ShippedTemplate {
  /** `<module>.<name>`, such as `awards.nomination`. Never changes: a form made from it remembers it. */
  key: string
  /** `record` for a set of custom fields; a form people send when left out. */
  mode?: 'submission' | 'record'
  /** The slots it suits (`forms.slot` ids). It is offered first where a form is started for one of them. */
  slots?: string[]
}

/**
 * What is wrong with a contributed template, or nothing: the checks the shipped ones are held to
 * (FB-208), a key in its module's name, and no clash with a shipped one. Sources and actions are
 * not checked here: one whose module is off is a problem the builder shows, as for any form.
 */
export function templateFaults(t: Partial<ContributedTemplate> | undefined, module: string): string[] {
  if (!t || typeof t !== 'object') return ['is not a template']
  const faults: string[] = []
  if (typeof t.key !== 'string' || !t.key.startsWith(`${module}.`)) faults.push(`key must start with "${module}."`)
  if (SHIPPED_TEMPLATES.some(s => s.key === t.key)) faults.push('key is a shipped template\'s')
  if (typeof t.name !== 'string' || !t.name) faults.push('needs a name')
  if (typeof t.description !== 'string' || !t.description) faults.push('needs a description')
  if (t.mode !== undefined && t.mode !== 'submission' && t.mode !== 'record') faults.push('mode must be submission or record')
  if (t.slots !== undefined && !(Array.isArray(t.slots) && t.slots.every(s => typeof s === 'string'))) faults.push('slots must be slot ids')
  const parsed = parseDefinition(t.definition)
  if (!parsed.ok) return [...faults, ...parsed.faults.map(f => `definition${f.path.length ? `.${f.path.join('.')}` : ''} ${f.message}`)]
  for (const p of checkDefinition(parsed.definition)) if (p.level === 'error') faults.push(`definition: ${p.code} at ${p.at}`)
  return faults
}
