// FB-208 (1): each shipped template is in the format and passes the problems list with no error.
// FB-510: so is each template another module ships through forms.template, wherever it is written.
import { describe, expect, it } from 'vitest'
import { checkDefinition, parseDefinition } from '../../shared/engine'
import { SHIPPED_TEMPLATES, templateFaults } from '../../shared/templates'

describe('shipped templates', () => {
  it.each(SHIPPED_TEMPLATES.map(t => [t.key, t] as const))('%s is a working form', (_key, template) => {
    const parsed = parseDefinition(template.definition)
    expect(parsed.ok ? [] : parsed.faults).toEqual([])
    expect(checkDefinition(template.definition).filter(p => p.level === 'error')).toEqual([])
  })
})

// Every contribution to forms.template in the repository: the modules' own and the test fixtures'.
const files = import.meta.glob<{ default: unknown }>(['../../../*/server/contributions/forms.template/*.ts', '../../../../tests/fixtures/*/*/server/contributions/forms.template/*.ts'], { eager: true })
const contributed = Object.entries(files).map(([path, mod]) => [path.replace(/^.*\/([^/]+)\/server\/contributions\//, '$1: '), /\/([^/]+)\/server\/contributions\//.exec(path)![1]!, mod.default] as const)

describe('contributed templates', () => {
  it('finds the ones the modules ship', () => {
    expect(contributed.map(([name]) => name)).toEqual(expect.arrayContaining(['awards: forms.template/nomination.ts', 'gallery: forms.template/show-feedback.ts']))
  })
  it.each(contributed)('%s is a working form', (_name, module, template) => {
    expect(templateFaults(template as never, module)).toEqual([])
  })
  it('refuses one that is not', () => {
    const def = SHIPPED_TEMPLATES[2]!.definition
    expect(templateFaults({ key: 'forms.feedback-survey', name: 'x', description: 'y', definition: def }, 'forms')).toEqual(['key is a shipped template\'s'])
    expect(templateFaults({ key: 'other.thing', name: 'x', description: 'y', definition: def }, 'awards')).toEqual(['key must start with "awards."'])
    expect(templateFaults({ key: 'awards.x', name: 'x', description: 'y', definition: { format: 1, pages: [] } }, 'awards')[0]).toMatch(/^definition/)
    const unlabelled = structuredClone(def)
    ;(unlabelled.pages[0]!.items[0] as { label: string }).label = ''
    expect(templateFaults({ key: 'awards.x', name: 'x', description: 'y', mode: 'record', definition: unlabelled }, 'awards')).toEqual(['definition: no-label at overall'])
  })
})
