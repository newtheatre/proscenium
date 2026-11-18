// Editing a definition in the builder (FB-201, FB-203, FB-204) and the two "can never be reached"
// warnings of the problems list (FB-206).
import { describe, expect, it } from 'vitest'
import { addItem, addPage, blankQuestion, change, dependents, duplicate, earlier, find, freshId, keyFrom, moveItem, movePage, nextOptionId, pair, removeItem, removePage, unpair } from '../../shared/builder/edit'
import { RECEIVED, certainty, checkDefinition, firstStage, hasStages, isFinal, movesFrom, parseDefinition, publishable, resubmitMove, reviewWorkflow, stageOf, statusOf } from '../../shared/engine'
import type { Condition, Definition, Question } from '../../shared/engine'

const q = (id: string, more: Partial<Question> = {}): Question => ({ kind: 'question', id, key: id, type: 'text.short', label: id, dataClass: 'internal', ...more })
const two = (): Definition => ({ format: 1, pages: [
  { id: 'p1', title: 'One', items: [q('a'), q('b'), { kind: 'group', id: 'g', key: 'g', label: 'Group', items: [q('g1'), q('g2')] }] },
  { id: 'p2', title: 'Two', items: [q('c'), q('d')] },
] })
const order = (def: Definition) => def.pages.map(p => p.items.map(i => i.kind === 'row' ? `[${i.items.map(x => x.id).join('+')}]` : i.kind === 'group' ? `${i.id}(${i.items.map(x => x.id).join(',')})` : i.id).join(' '))

describe('editing', () => {
  it('never changes the definition it was given', () => {
    const def = two()
    const before = JSON.stringify(def)
    moveItem(def, 'a', 'p2', 0)
    removeItem(def, 'b')
    pair(def, 'a', 'b')
    expect(JSON.stringify(def)).toBe(before)
  })

  it('adds a question with an id and key nothing else uses, and options for a choice', () => {
    const def = two()
    const added = blankQuestion(def, 'choice.single', 'A')
    expect(find(def, added.id)).toBeNull()
    expect(added.key).toBe('a_2')
    expect(added.options).toHaveLength(2)
    const next = addItem(def, 'p1', added, 1)
    expect(order(next)[0]).toBe(`a ${added.id} b g(g1,g2)`)
    expect(parseDefinition(next).ok).toBe(true)
    expect(freshId(next, 'q')).not.toBe(added.id)
  })

  it('makes a key from a label, and keeps option ids unused for ever', () => {
    expect(keyFrom(two(), 'What is your café\'s name?')).toBe('what_is_your_cafe_s_name')
    expect(keyFrom(two(), '123')).toBe('question')
    expect(nextOptionId(q('x', { options: [{ id: 'o1', label: '' }, { id: 'o7', label: '' }] }))).toBe('o8')
  })

  it('moves an item within a page, to another page, and into and out of a group', () => {
    expect(order(moveItem(two(), 'a', 'p1', 1))).toEqual(['b a g(g1,g2)', 'c d'])
    expect(order(moveItem(two(), 'a', 'p2', 1))).toEqual(['b g(g1,g2)', 'c a d'])
    expect(order(moveItem(two(), 'a', 'g', 1))).toEqual(['b g(g1,a,g2)', 'c d'])
    expect(order(moveItem(two(), 'g2', 'p2', 0))).toEqual(['a b g(g1)', 'g2 c d'])
    // A group does not go inside a group.
    expect(order(moveItem(two(), 'g', 'g', 0))).toEqual(order(two()))
  })

  it('pairs two questions into a row and parts them again; removing one leaves the other on its own', () => {
    const paired = pair(two(), 'd', 'a')
    expect(order(paired)).toEqual(['[a+d] b g(g1,g2)', 'c'])
    expect(parseDefinition(paired).ok).toBe(true)
    const row = paired.pages[0]!.items[0]!.id
    expect(order(unpair(paired, row))).toEqual(['a d b g(g1,g2)', 'c'])
    expect(order(removeItem(paired, 'a'))).toEqual(['d b g(g1,g2)', 'c'])
  })

  it('adds, moves and removes pages, never the last one, and drops routes to a removed page', () => {
    const def = two()
    def.pages[0]!.routes = [{ when: { left: { answer: 'a' }, op: 'answered' }, to: { page: 'p2' } }]
    const { def: three, id } = addPage(def, 'p1')
    expect(three.pages.map(p => p.id)).toEqual(['p1', id, 'p2'])
    expect(movePage(three, 'p2', 0).pages.map(p => p.id)).toEqual(['p2', 'p1', id])
    const one = removePage(def, 'p2')
    expect(one.pages.map(p => p.id)).toEqual(['p1'])
    expect(one.pages[0]!.routes).toEqual([])
    expect(removePage(one, 'p1')).toBe(one)
  })

  it('duplicates a question under a new id and key', () => {
    const made = duplicate(two(), 'a')!
    expect(order(made.def)[0]).toBe(`a ${made.id} b g(g1,g2)`)
    expect(parseDefinition(made.def).ok).toBe(true)
  })

  it('names what reads a question, and offers only earlier questions to a condition', () => {
    let def = change(two(), 'c', (x: Question) => { x.visibleWhen = { all: [{ left: { answer: 'a' }, op: 'answered' }] } })
    def = change(def, 'p2', (p) => { p.visibleWhen = { left: { answer: 'a' }, op: 'is', right: { value: 'x' } } })
    def.calculations = [{ id: 'total', key: 'total', type: 'number', expression: { fn: 'count', group: 'g' } }]
    expect(dependents(def, 'a').sort()).toEqual(['c', 'p2'])
    expect(dependents(def, 'g')).toEqual(['total'])
    expect(dependents(def, 'b')).toEqual([])
    expect(earlier(def, 'a')).toEqual([])
    expect(earlier(def, 'd').map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(earlier(def, 'g2').map(x => x.id)).toEqual(['a', 'b', 'g1'])
    expect(earlier(def, 'p2').map(x => x.id)).toEqual(['a', 'b'])
  })
})

describe('what can never be reached', () => {
  const is = (answer: string, value: string): Condition => ({ left: { answer }, op: 'is', right: { value } })
  it('decides only what is certain', () => {
    expect(certainty(is('a', 'x'))).toBe('depends')
    expect(certainty({ all: [is('a', 'x'), is('a', 'y')] })).toBe('never')
    expect(certainty({ all: [is('a', 'x'), is('a', ' X ')] })).toBe('depends')
    expect(certainty({ all: [is('a', 'x'), { left: { answer: 'a' }, op: 'is-not', right: { value: 'x' } }] })).toBe('never')
    expect(certainty({ all: [{ left: { answer: 'a' }, op: 'answered' }, { left: { answer: 'a' }, op: 'empty' }] })).toBe('never')
    expect(certainty({ any: [] })).toBe('never')
    expect(certainty({ all: [] })).toBe('always')
    expect(certainty({ none: [{ all: [] }] })).toBe('never')
    expect(certainty({ any: [is('a', 'x'), { all: [] }] })).toBe('always')
    expect(certainty({ all: [is('a', 'x'), is('b', 'y')] })).toBe('depends')
  })

  it('warns of a question that can never be shown, more loudly when it is required, and still lets the form publish', () => {
    const never: Condition = { all: [is('a', 'x'), is('a', 'y')] }
    let def = change(two(), 'c', (x: Question) => { x.visibleWhen = never })
    def = change(def, 'd', (x: Question) => {
      x.visibleWhen = never
      x.required = true
    })
    const problems = checkDefinition(def)
    expect(problems.map(p => `${p.level}:${p.code}@${p.at}`)).toEqual(['warning:never-shown@c', 'warning:required-never-shown@d'])
    expect(publishable(problems)).toBe(true)
  })

  it('lets a draft hold an empty condition or group, and lists each as a problem that stops a publish', () => {
    const def = change(two(), 'c', (x: Question) => { x.required = { all: [] } })
    def.pages[1]!.items.push({ kind: 'group', id: 'h', key: 'h', label: 'Helpers', items: [] })
    expect(parseDefinition(def).ok).toBe(true)
    const problems = checkDefinition(def)
    expect(problems.map(p => `${p.code}@${p.at}`)).toEqual(['no-questions@h', 'empty-condition@c'])
    expect(publishable(problems)).toBe(false)
  })

  it('asks for page titles only once a form has more than one page', () => {
    const one: Definition = { format: 1, pages: [{ id: 'p1', title: '', items: [q('a')] }] }
    expect(checkDefinition(one)).toEqual([])
    const several = two()
    several.pages[1]!.title = ' '
    expect(checkDefinition(several).map(p => `${p.code}@${p.at}`)).toEqual(['no-label@p2'])
  })

  it('warns of a page every route passes over, once, and not of what is inside it', () => {
    const def = two()
    def.pages.push({ id: 'p3', title: 'Three', items: [q('e')] })
    // A route that is always taken: none of a pair that can never both hold.
    def.pages[0]!.routes = [{ when: { none: [{ all: [is('a', 'x'), is('a', 'y')] }] }, to: { page: 'p3' } }]
    def.pages[1]!.items[0] = q('c', { visibleWhen: { all: [is('a', 'x'), is('a', 'y')] } })
    expect(checkDefinition(def).map(p => `${p.code}@${p.at}`)).toEqual(['never-reached@p2'])
  })
})

describe('stages', () => {
  const names = { received: 'Received', review: 'In review', returned: 'Returned', approved: 'Approved', declined: 'Declined', start: 'Start review', back: 'Return for changes', resubmit: 'Send changes', approve: 'Approve', decline: 'Decline' }
  const staged = (): Definition => ({ ...two(), workflow: reviewWorkflow(names) })
  const codes = (def: Definition) => checkDefinition(def).map(p => `${p.level}:${p.code}@${p.at}`)

  it('a form with no stages has one, Received, which is closed and final', () => {
    expect(hasStages(two())).toBe(false)
    expect(firstStage(two())).toMatchObject({ key: RECEIVED, kind: 'closed' })
    expect(isFinal(firstStage(two()).kind)).toBe(true)
    expect(movesFrom(two(), RECEIVED, 'staff')).toEqual([])
  })

  it('the review starting point parses, has no problems, and offers each mover only their own moves', () => {
    const def = staged()
    expect(parseDefinition(def).ok).toBe(true)
    expect(codes(def)).toEqual([])
    expect(firstStage(def).key).toBe('received')
    expect(movesFrom(def, 'in_review', 'staff').map(t => t.key)).toEqual(['return', 'approve', 'decline'])
    expect(movesFrom(def, 'in_review', 'submitter')).toEqual([])
    expect(resubmitMove(def, 'returned')?.to).toBe('in_review')
    expect(resubmitMove(def, 'in_review')).toBeUndefined()
    expect(statusOf(stageOf(def, 'returned'))).toBe('Returned')
    expect(statusOf({ key: 'x', name: 'Panel', kind: 'in_review', status: ' Being considered ' })).toBe('Being considered')
  })

  it('lists what is wrong with stages and moves', () => {
    const def = staged()
    const flow = def.workflow!
    flow.stages[1]!.name = ' '
    flow.transitions = flow.transitions.filter(t => t.key !== 'resubmit')
    flow.transitions.push({ key: 'approve', from: 'received', to: 'nowhere', label: '', who: 'staff' }, { key: 'loop', from: 'received', to: 'received', label: 'Loop', who: 'staff' })
    flow.stages.push({ key: 'archive', name: 'Archive', kind: 'closed' }, { key: 'waiting', name: 'Waiting', kind: 'pending' })
    flow.transitions.push({ key: 'park', from: 'received', to: 'waiting', label: 'Park', who: 'staff' })
    expect(codes(def).sort()).toEqual([
      'error:move-duplicate@move:approve', 'error:move-no-label@move:approve', 'error:move-unknown-stage@move:approve',
      'error:move-nowhere@move:loop', 'error:returned-no-way-back@stage:returned', 'error:stage-no-name@stage:in_review',
      'warning:stage-dead-end@stage:waiting', 'warning:stage-unreachable@stage:archive',
    ].sort())
  })
})
