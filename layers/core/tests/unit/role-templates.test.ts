// The role templates name only abilities some module declares, so a renamed ability cannot leave a
// template quietly ticking less than it says.
import { describe, expect, it } from 'vitest'
import { ROLE_TEMPLATES } from '../../shared/role-templates'

const manifests = import.meta.glob<{ default: { id: string, abilities?: Record<string, unknown> } }>('../../../*/module.ts', { eager: true })

describe('role templates', () => {
  it('name only declared abilities', () => {
    const declared = new Set(Object.values(manifests).flatMap(m => Object.keys(m.default.abilities ?? {})))
    expect(declared.size).toBeGreaterThan(100)
    for (const template of ROLE_TEMPLATES) expect(template.abilities.filter(a => !declared.has(a)), template.id).toEqual([])
  })
})
