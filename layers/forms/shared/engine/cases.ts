// The shared case set (part 3, "One engine, proved"): a definition with answers and facts and the
// outcome expected. The same cases run in Node, in the Worker runtime and in a browser, and a
// difference between them fails the build. Add a case here whenever the engine learns something.
import type { Answers, Context, Definition, Evaluation } from './types'

export interface Case {
  name: string
  definition: Definition
  answers: Answers
  context?: Partial<Context>
  /** Compared part by part: only the keys given are checked, each exactly. */
  expect: Partial<Pick<Evaluation, 'visible' | 'required' | 'issues' | 'calculated' | 'route' | 'answers' | 'valid'>> & { ending?: string | null }
}

const today = '2026-11-17'

/** A nomination: a person, an award, and a question shown for one of the awards only. */
const nomination: Definition = {
  format: 1,
  pages: [
    { id: 'p1', title: 'Who are you nominating?', items: [
      { kind: 'question', id: 'who', key: 'nominee', type: 'record', source: 'core.person', label: 'Who are you nominating?', required: true, dataClass: 'personal', peopleInvolved: true },
      { kind: 'question', id: 'award', key: 'award', type: 'choice.single', label: 'Which award?', required: true, dataClass: 'internal', options: [{ id: 'fel', label: 'Fellowship' }, { id: 'com', label: 'Commendation' }], allowOther: true },
      { kind: 'question', id: 'for', key: 'commended_for', type: 'text.short', label: 'What is the commendation for?', required: true, dataClass: 'internal', visibleWhen: { left: { answer: 'award' }, op: 'is', right: { option: 'com' } } },
      { kind: 'question', id: 'show', key: 'show', type: 'record', source: 'core.production', label: 'Which show?', dataClass: 'internal', visibleWhen: { all: [{ left: { answer: 'award' }, op: 'is', right: { option: 'com' } }, { left: { answer: 'for' }, op: 'contains', right: { value: 'design' } }] } },
    ] },
    { id: 'p2', title: 'Your reasons', items: [
      { kind: 'question', id: 'why', key: 'reasons', type: 'text.long', label: 'Why do they deserve it?', required: true, dataClass: 'free-text', validation: [{ rule: 'minLength', value: 20, message: 'Tell the committee a little more.' }] },
      { kind: 'question', id: 'told', key: 'nominee_knows', type: 'yesno', label: 'Does the nominee know?', dataClass: 'internal' },
      { kind: 'question', id: 'faith', key: 'good_faith', type: 'consent', label: 'I am making this nomination in good faith', required: true, dataClass: 'internal' },
    ] },
  ],
}

/** A proposal: a repeating team, a budget worked out from it, and routing by answers and facts. */
const proposal: Definition = {
  format: 1,
  pages: [
    { id: 'about', title: 'The show', items: [
      { kind: 'question', id: 'title', key: 'title', type: 'text.short', label: 'Title', required: true, dataClass: 'internal', validation: [{ rule: 'maxLength', value: 60 }] },
      { kind: 'row', id: 'dates', items: [
        { kind: 'question', id: 'opens', key: 'opens', type: 'date', label: 'Opening night', required: true, dataClass: 'internal', validation: [{ rule: 'minDate', value: { today: 28 } }] },
        { kind: 'question', id: 'nights', key: 'nights', type: 'number', label: 'Number of nights', required: true, dataClass: 'internal', validation: [{ rule: 'whole' }, { rule: 'min', value: 1 }, { rule: 'max', value: 10 }] },
      ] },
      { kind: 'question', id: 'rig', key: 'rigging', type: 'yesno', label: 'Does the show need rigging?', required: true, dataClass: 'internal' },
      { kind: 'question', id: 'genres', key: 'genres', type: 'choice.multiple', label: 'Genres', dataClass: 'internal', options: [{ id: 'com', label: 'Comedy' }, { id: 'tra', label: 'Tragedy' }, { id: 'mus', label: 'Musical' }], validation: [{ rule: 'maxChosen', value: 2 }] },
    ], routes: [
      { when: { left: { fact: 'core.member' }, op: 'is-not', right: { value: true } }, to: { ending: 'members-only' } },
      { when: { left: { answer: 'rig' }, op: 'is', right: { value: false } }, to: { page: 'money' } },
    ] },
    { id: 'tech', title: 'Technical requirements', items: [
      { kind: 'question', id: 'rigplan', key: 'rig_plan', type: 'text.long', label: 'Describe the rigging', required: true, dataClass: 'internal' },
    ] },
    { id: 'money', title: 'Team and budget', items: [
      { kind: 'group', id: 'team', key: 'team', label: 'Team', min: 1, max: 3, items: [
        { kind: 'question', id: 'role', key: 'role', type: 'choice.dropdown', label: 'Role', required: true, dataClass: 'internal', options: [{ id: 'dir', label: 'Director' }, { id: 'pro', label: 'Producer' }] },
        { kind: 'question', id: 'fee', key: 'fee', type: 'money', label: 'Fee', dataClass: 'internal' },
        { kind: 'question', id: 'exp', key: 'experience', type: 'text.long', label: 'Directing experience', required: { left: { answer: 'fee' }, op: 'more-than', right: { value: 10000 } }, visibleWhen: { left: { answer: 'role' }, op: 'is', right: { option: 'dir' } }, dataClass: 'free-text' },
      ] },
      { kind: 'question', id: 'set', key: 'set_budget', type: 'money', label: 'Set budget', dataClass: 'internal' },
      { kind: 'question', id: 'big', key: 'big_budget_reason', type: 'text.long', label: 'Why so much?', required: true, dataClass: 'internal', visibleWhen: { left: { calculation: 'total' }, op: 'more-than', right: { value: 50000 } } },
      { kind: 'content', id: 'note', text: 'Budgets over £500 go to the treasurer.', visibleWhen: { left: { calculation: 'total' }, op: 'more-than', right: { value: 50000 } } },
    ] },
  ],
  calculations: [
    { id: 'fees', key: 'fees', type: 'money', expression: { fn: 'sum', group: 'team', of: 'fee' } },
    { id: 'total', key: 'total', type: 'money', expression: { fn: 'add', args: [{ calculation: 'fees' }, { fn: 'choose', when: { left: { answer: 'set' }, op: 'answered' }, then: { answer: 'set' }, else: { value: 0 } }] } },
    { id: 'each', key: 'per_night', type: 'money', expression: { fn: 'divide', args: [{ calculation: 'total' }, { answer: 'nights' }] } },
    { id: 'closes', key: 'closes', type: 'date', expression: { fn: 'add-days', args: [{ answer: 'opens' }, { fn: 'subtract', args: [{ answer: 'nights' }, { value: 1 }] }] } },
    { id: 'head', key: 'headcount', type: 'number', expression: { fn: 'count', group: 'team' } },
  ],
  endings: [{ id: 'members-only', title: 'Members only', message: 'Proposals are open to current members.', submits: false }],
}

const fullProposal: Answers = {
  title: 'Posh', opens: '2027-02-10', nights: 3, rig: false,
  team: [{ role: 'dir', fee: 5000, exp: 'Two studio shows' }, { role: 'pro', fee: 5000, exp: 'hidden for a producer' }],
  set: 30001,
}

export const CASES: Case[] = [
  {
    name: 'a question shown by an option, and its answer kept',
    definition: nomination,
    answers: { who: 'acc_1', award: 'com', for: 'Lighting', why: 'She relit the whole show in two days.', faith: true },
    expect: { visible: { p1: true, who: true, award: true, for: true, show: false, p2: true, why: true, told: true, faith: true }, valid: true, route: ['p1', 'p2'], ending: null },
  },
  {
    name: 'the hidden answer: a value sent for a hidden question is dropped, and so is what hung on it',
    definition: nomination,
    answers: { who: 'acc_1', award: 'fel', for: 'Set design', show: 'prd_1', why: 'Six years of running the workshop.', faith: true, extra: 'not a question' },
    expect: { visible: { p1: true, who: true, award: true, for: false, show: false, p2: true, why: true, told: true, faith: true }, answers: { who: 'acc_1', award: 'fel', why: 'Six years of running the workshop.', faith: true }, valid: true },
  },
  {
    name: 'all of two conditions, and text compared without regard to case',
    definition: nomination,
    answers: { who: 'acc_1', award: 'com', for: '  SET DESIGN, The Crucible ', show: 'prd_1' },
    expect: { visible: { p1: true, who: true, award: true, for: true, show: true, p2: true, why: true, told: true, faith: true } },
  },
  {
    name: 'required, the theatre\'s own message, and a consent left unticked',
    definition: nomination,
    answers: { award: 'com', why: 'Too short', faith: false },
    expect: {
      required: { who: true, award: true, for: true, why: true, told: false, faith: true },
      issues: { who: [{ rule: 'required' }], for: [{ rule: 'required' }], why: [{ rule: 'minLength', message: 'Tell the committee a little more.', params: { min: 20, length: 9 } }], faith: [{ rule: 'required' }] },
      valid: false,
    },
  },
  {
    name: 'an "Other" answer needs its text, and an unknown option is refused',
    definition: nomination,
    answers: { who: 'acc_1', award: 'other', why: 'x'.repeat(20), faith: true },
    expect: { issues: { award: [{ rule: 'other' }] } },
  },
  {
    name: 'an "Other" answer with its text is kept',
    definition: nomination,
    answers: { 'who': 'acc_1', 'award': 'other', 'award:other': 'Long service', 'why': 'x'.repeat(20), 'faith': true },
    expect: { valid: true, answers: { 'who': 'acc_1', 'award': 'other', 'award:other': 'Long service', 'why': 'x'.repeat(20), 'faith': true } },
  },
  {
    name: 'an option that does not exist',
    definition: nomination,
    answers: { who: 'acc_1', award: 'knighthood', why: 'x'.repeat(20), faith: true },
    expect: { issues: { award: [{ rule: 'option' }] } },
  },
  {
    name: 'a route skips a page, and the skipped page is hidden',
    definition: proposal,
    context: { facts: { 'core.member': true } },
    answers: { ...fullProposal, rigplan: 'sent anyway' },
    expect: {
      route: ['about', 'money'], ending: null, valid: true,
      visible: { 'about': true, 'title': true, 'dates': true, 'opens': true, 'nights': true, 'rig': true, 'genres': true, 'tech': false, 'rigplan': false, 'money': true, 'team': true, 'team.0.role': true, 'team.0.fee': true, 'team.0.exp': true, 'team.1.role': true, 'team.1.fee': true, 'team.1.exp': false, 'set': true, 'big': false, 'note': false },
      answers: { title: 'Posh', opens: '2027-02-10', nights: 3, rig: false, team: [{ role: 'dir', fee: 5000, exp: 'Two studio shows' }, { role: 'pro', fee: 5000 }], set: 30001 },
    },
  },
  {
    name: 'pennies: money stays in whole minor units and a three-way split rounds once',
    definition: proposal,
    context: { facts: { 'core.member': true } },
    answers: fullProposal,
    expect: { calculated: { fees: 10000, total: 40001, each: 13334, closes: '2027-02-12', head: 2 } },
  },
  {
    name: 'a calculation with an empty input is empty, but a sum counts nothing as nothing',
    definition: proposal,
    context: { facts: { 'core.member': true } },
    answers: { title: 'Posh', rig: false, team: [{ role: 'pro' }] },
    expect: { calculated: { fees: 0, total: 0, each: null, closes: null, head: 1 } },
  },
  {
    name: 'the forged fact: without the server\'s fact the form ends early and stores nothing',
    definition: proposal,
    context: { facts: {} },
    answers: fullProposal,
    expect: { route: ['about'], ending: 'members-only', visible: { about: true, title: true, dates: true, opens: true, nights: true, rig: true, genres: true, tech: false, rigplan: false, money: false, team: false, set: false, big: false, note: false }, answers: { title: 'Posh', opens: '2027-02-10', nights: 3, rig: false } },
  },
  {
    name: 'a calculation shows a question, which is then required',
    definition: proposal,
    context: { facts: { 'core.member': true } },
    answers: { ...fullProposal, rig: true, rigplan: 'Two flown flats', set: 45000 },
    expect: { route: ['about', 'tech', 'money'], calculated: { fees: 10000, total: 55000, each: 18333, closes: '2027-02-12', head: 2 }, issues: { big: [{ rule: 'required' }] }, valid: false },
  },
  {
    name: 'inside a repeating group: required by a condition on the same entry, and the group\'s own limits',
    definition: proposal,
    context: { facts: { 'core.member': true } },
    answers: { ...fullProposal, team: [{ role: 'dir', fee: 20000 }, { role: 'dir', fee: 100 }, { fee: 1 }, { role: 'pro' }] },
    expect: {
      required: { 'title': true, 'opens': true, 'nights': true, 'rig': true, 'genres': false, 'set': false, 'big': true, 'team.0.role': true, 'team.0.fee': false, 'team.0.exp': true, 'team.1.role': true, 'team.1.fee': false, 'team.1.exp': false, 'team.2.role': true, 'team.2.fee': false, 'team.3.role': true, 'team.3.fee': false },
      issues: { 'team': [{ rule: 'maxEntries', params: { max: 3 } }], 'team.0.exp': [{ rule: 'required' }], 'team.2.role': [{ rule: 'required' }], 'big': [{ rule: 'required' }] },
    },
  },
  {
    name: 'rules at their boundaries: a date relative to today, whole numbers, how many chosen',
    definition: proposal,
    context: { facts: { 'core.member': true } },
    answers: { title: 'x'.repeat(61), opens: '2026-12-14', nights: 2.5, rig: false, genres: ['com', 'tra', 'mus'], team: [{ role: 'pro' }] },
    expect: { issues: { title: [{ rule: 'maxLength', params: { max: 60, length: 61 } }], opens: [{ rule: 'minDate', params: { date: '2026-12-15' } }], nights: [{ rule: 'whole' }], genres: [{ rule: 'maxChosen', params: { max: 2 } }] } },
  },
  {
    name: 'the same rules pass exactly on the boundary',
    definition: proposal,
    context: { facts: { 'core.member': true } },
    answers: { title: 'x'.repeat(60), opens: '2026-12-15', nights: 10, rig: false, genres: ['com', 'tra'], team: [{ role: 'pro' }] },
    expect: { issues: {}, valid: true },
  },
  {
    name: 'answers of the wrong type are refused, never coerced',
    definition: proposal,
    context: { facts: { 'core.member': true } },
    answers: { title: 7 as unknown as string, opens: '2027-02-30', nights: '3', rig: 'no', rigplan: 'A wrong answer to rig takes no route', genres: ['com', 'com'], team: [{ role: 'pro', fee: 12.5 }] },
    expect: { issues: { 'title': [{ rule: 'type' }], 'opens': [{ rule: 'type' }], 'nights': [{ rule: 'type' }], 'rig': [{ rule: 'type' }], 'genres': [{ rule: 'option' }], 'team.0.fee': [{ rule: 'type' }] } },
  },
]

/** Runs one case and says what differs, as a list of readable lines. Empty means it passed. */
export function differences(c: Case, result: Evaluation): string[] {
  const out: string[] = []
  const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
  for (const key of ['visible', 'required', 'issues', 'calculated', 'route', 'answers', 'valid'] as const) {
    if (c.expect[key] !== undefined && !same(c.expect[key], result[key])) out.push(`${key}: expected ${JSON.stringify(sorted(c.expect[key]))}, got ${JSON.stringify(sorted(result[key]))}`)
  }
  if (c.expect.ending !== undefined && (result.ending?.id ?? null) !== c.expect.ending) out.push(`ending: expected ${c.expect.ending}, got ${result.ending?.id ?? null}`)
  return out
}
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])]))
  return v
}
export const CASE_TODAY = today
