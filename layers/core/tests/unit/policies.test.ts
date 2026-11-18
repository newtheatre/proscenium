// Policies: a section's front matter, which sections a policy shows, when a condition holds, what a
// section may quote, and the plain text a version records.
import { describe, expect, it } from 'vitest'
import { holds, parseSection, readConditions, renderBody, renderPolicy, sectionTokens, selectSections, shortHash, type PolicyContext, type PolicySection } from '../../shared/policies'

const context = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  settings: { 'core.site.name': { value: 'The Playhouse', text: 'The Playhouse' }, 'core.flag': { value: true }, 'core.age': { value: 14, text: '14' }, 'core.empty': { value: null } },
  facts: { 'payments.card-providers': { value: 'stripe', text: 'Stripe' } },
  tables: { cookies: { headers: ['Name', 'Why'], rows: [['`session`', 'Keeps you signed in']] }, empty: { headers: ['A'], rows: [] } },
  modules: ['core', 'bar'],
  country: 'gb',
  ...over,
})

const section = (over: Partial<PolicySection>): PolicySection => ({
  policy: 'privacy', id: 'one', module: 'core', owner: 'upstream', file: 'x.md', title: 'One', order: 10, when: [], law: 'any', body: 'Text.', hash: shortHash('One\nText.'), ...over,
})

describe('a section file', () => {
  it('reads its small front matter', () => {
    const parsed = parseSection('---\ntitle: The members\' area\norder: 20\nrevised: 2026-11-18\nlaw: GB\nwhen: \'setting="core.flag" is="true"; module="bar"\'\nmust-write: true\n---\n\nBody here.\n')
    expect(parsed.problems).toEqual([])
    expect(parsed.fields).toMatchObject({ title: 'The members\' area', order: 20, revised: '2026-11-18', law: 'gb', mustWrite: true })
    expect(parsed.fields.when).toEqual([{ setting: 'core.flag', is: 'true' }, { module: 'bar' }])
    expect(parsed.body).toBe('Body here.')
  })

  it('names what is wrong with it', () => {
    expect(parseSection('No front matter').problems).toHaveLength(1)
    const parsed = parseSection('---\ntitle: T\norder: soon\nrevised: yesterday\nlaw: britain\ncolour: red\n---\n')
    expect(parsed.problems).toHaveLength(4)
  })

  it('refuses a condition that tests nothing or two things', () => {
    const problems: string[] = []
    readConditions('setting="a"; setting="a" module="b" is="1"; colour="red"', problems)
    expect(problems).toHaveLength(4)
  })
})

describe('a condition', () => {
  it('tests a setting, a value being set, a module and a fact', () => {
    const c = context()
    expect(holds({ setting: 'core.flag', is: 'true' }, c)).toBe(true)
    expect(holds({ setting: 'core.flag', not: 'true' }, c)).toBe(false)
    expect(holds({ setting: 'core.age', above: '0' }, c)).toBe(true)
    expect(holds({ setting: 'core.age', above: '14' }, c)).toBe(false)
    expect(holds({ has: 'core.site.name' }, c)).toBe(true)
    expect(holds({ has: 'core.empty' }, c)).toBe(false)
    expect(holds({ has: 'core.unknown' }, c)).toBe(false)
    expect(holds({ module: 'bar' }, c)).toBe(true)
    expect(holds({ module: 'forms' }, c)).toBe(false)
    expect(holds({ fact: 'payments.card-providers', not: '' }, c)).toBe(true)
    expect(holds({ fact: 'payments.none', not: '' }, c)).toBe(false)
  })
})

describe('the sections a policy shows', () => {
  it('orders them, and leaves out a module that is off, another country\'s law and a condition that fails', () => {
    const all = [
      section({ id: 'b', order: 20 }),
      section({ id: 'a', order: 10 }),
      section({ id: 'forms', module: 'forms' }),
      section({ id: 'french', law: 'fr' }),
      section({ id: 'british', law: 'gb', order: 30 }),
      section({ id: 'off', when: [{ setting: 'core.flag', is: 'false' }] }),
      section({ id: 'other', policy: 'terms' }),
    ]
    expect(selectSections(all, 'privacy', context()).sections.map(s => s.id)).toEqual(['a', 'b', 'british'])
  })

  it('swaps in the theatre\'s replacement, keeping the place of what it replaces', () => {
    const base = section({ id: 'a', order: 10, law: 'gb' })
    const own = section({ id: 'a', module: 'site', owner: 'site', order: Number.NaN, law: 'inherit', body: 'Ours.', basedOn: base.hash })
    const found = selectSections([section({ id: 'b', order: 20 }), base, own], 'privacy', context())
    expect(found.sections.map(s => [s.id, s.body, s.order])).toEqual([['a', 'Ours.', 10], ['b', 'Text.', 20]])
    expect(found.stale).toEqual([])
    expect(selectSections([base, own], 'privacy', context({ country: 'fr' })).sections).toEqual([])
  })

  it('says when upstream has moved on since a replacement was written', () => {
    const base = section({ id: 'a' })
    const own = section({ id: 'a', module: 'site', owner: 'site', basedOn: 'an-older-hash' })
    expect(selectSections([base, own], 'privacy', context()).stale).toHaveLength(1)
  })

  it('drops a hidden section and adds the theatre\'s extras', () => {
    const all = [
      section({ id: 'a' }),
      section({ id: 'a', module: 'site', owner: 'site', hidden: true, reason: 'We have no bar.' }),
      section({ id: 'extra', module: 'site', owner: 'site', order: 5, law: 'inherit' }),
    ]
    expect(selectSections(all, 'privacy', context()).sections.map(s => s.id)).toEqual(['extra'])
  })

  it('leaves a section the theatre must write off the page until it is written', () => {
    const must = section({ id: 'tested', mustWrite: true })
    const unwritten = selectSections([must], 'privacy', context())
    expect(unwritten.sections).toEqual([])
    expect(unwritten.unwritten.map(s => s.id)).toEqual(['tested'])
    const written = selectSections([must, section({ id: 'tested', module: 'site', owner: 'site', order: Number.NaN, law: 'inherit', body: 'We tested it.' })], 'privacy', context())
    expect(written.sections.map(s => s.body)).toEqual(['We tested it.'])
    expect(written.unwritten).toEqual([])
  })
})

describe('what a section quotes', () => {
  it('finds each token, and whether an unset value is guarded', () => {
    const tokens = sectionTokens([
      'Plain :setting{name="core.a"}.',
      '::when{has="core.b"}',
      'Guarded :setting{name="core.b"} and :fact{name="payments.x"}.',
      '#otherwise',
      'Not guarded here :setting{name="core.b"}.',
      '::',
      'With :setting{name="core.c" fallback="us"}.',
      '::policy-table{kind="cookies"}',
      '::',
      '`:setting{name="core.in-code"}`',
    ].join('\n'))
    expect(tokens.problems).toEqual([])
    expect(tokens.settings.map(s => [s.name, s.guarded, s.fallback])).toEqual([['core.a', false, false], ['core.b', true, false], ['core.b', false, false], ['core.c', false, true]])
    expect(tokens.facts.map(f => f.name)).toEqual(['payments.x'])
    expect(tokens.conditions.map(c => c.condition)).toEqual([{ has: 'core.b' }])
    expect(tokens.tables.map(t => t.kind)).toEqual(['cookies'])
  })

  it('names a block that is never closed and a token that quotes nothing', () => {
    expect(sectionTokens('::when{has="core.a"}\nText').problems).toHaveLength(1)
    expect(sectionTokens('A :setting{} here').problems).toHaveLength(1)
  })
})

describe('the text a version records', () => {
  it('keeps the side of each condition that holds and fills in every value', () => {
    const body = [
      'We are :setting{name="core.site.name"}, paid through :fact{name="payments.card-providers"}.',
      '',
      '::when{setting="core.flag" is="true"}',
      'Shown.',
      '',
      '#otherwise',
      'Hidden.',
      '::',
      '',
      '::when{has="core.empty"}',
      'Never.',
      '#otherwise',
      'Contact :setting{name="core.empty" fallback="us"}.',
      '::',
      '',
      '::policy-table{kind="cookies"}',
      '::',
      '',
      '::policy-table{kind="empty"}',
      '::',
    ].join('\n')
    expect(renderBody(body, context())).toBe([
      'We are The Playhouse, paid through Stripe.',
      '',
      'Shown.',
      '',
      'Contact us.',
      '',
      '| Name | Why |',
      '| --- | --- |',
      '| `session` | Keeps you signed in |',
    ].join('\n'))
  })

  it('puts a policy together under its title', () => {
    expect(renderPolicy('Privacy notice', [section({ title: 'One', body: 'First.' }), section({ title: 'Two', body: 'Second.' })], context())).toBe('# Privacy notice\n\n## One\n\nFirst.\n\n## Two\n\nSecond.')
  })
})
