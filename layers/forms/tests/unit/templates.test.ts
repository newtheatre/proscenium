// FB-208 (1): each shipped template is in the format and passes the problems list with no error.
import { describe, expect, it } from 'vitest'
import { checkDefinition, parseDefinition } from '../../shared/engine'
import { SHIPPED_TEMPLATES } from '../../shared/templates'

describe('shipped templates', () => {
  it.each(SHIPPED_TEMPLATES.map(t => [t.key, t] as const))('%s is a working form', (_key, template) => {
    const parsed = parseDefinition(template.definition)
    expect(parsed.ok ? [] : parsed.faults).toEqual([])
    expect(checkDefinition(template.definition).filter(p => p.level === 'error')).toEqual([])
  })
})
