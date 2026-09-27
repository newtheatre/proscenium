import { describe, expect, test } from 'bun:test'
import { departmentFromFilter, plannerModuleOptions } from '#shared/utils/training'

// Issue 1354: a new module can be published as it is added, the planner says why a draft cannot
// be scheduled rather than hiding it, and the department the list is filtered to is the one chosen.

const module = (id: string, status: string, signoffRequired = false): { id: string, name: string, status: string, signoffRequired: boolean } =>
  ({ id, name: `Module ${id}`, status, signoffRequired })

describe('the planner offers what can be taught, and says why a draft cannot', () => {
  test('an active module is offered; a draft is listed, disabled, saying what to do', () => {
    expect(plannerModuleOptions([module('TECH-101', 'ACTIVE'), module('TECH-102', 'DRAFT')])).toEqual([
      { label: 'TECH-101 Module TECH-101', value: 'TECH-101', disabled: false },
      { label: 'TECH-102 Module TECH-102 (a draft: publish it to schedule it)', value: 'TECH-102', disabled: true },
    ])
  })

  test('a retired module, or one proved by experience, is not listed at all (G-112 c3)', () => {
    expect(plannerModuleOptions([module('OLD-101', 'RETIRED'), module('EXP-101', 'ACTIVE', true), module('EXP-102', 'DRAFT', true)])).toEqual([])
  })

  test('what can be scheduled comes before what cannot', () => {
    expect(plannerModuleOptions([module('A-101', 'DRAFT'), module('B-101', 'ACTIVE')]).map(option => option.value)).toEqual(['B-101', 'A-101'])
  })
})

describe('a new module starts in the department the list is filtered to', () => {
  test('one department asked for is the one chosen', () => {
    expect(departmentFromFilter([{ key: 'department', operator: 'is', values: ['TECH'] }])).toBe('TECH')
    expect(departmentFromFilter([{ key: 'department', operator: 'any', values: ['FOH'] }])).toBe('FOH')
  })

  test('no filter, several departments or an exclusion choose nothing', () => {
    expect(departmentFromFilter([])).toBeNull()
    expect(departmentFromFilter([{ key: 'department', operator: 'any', values: ['TECH', 'FOH'] }])).toBeNull()
    expect(departmentFromFilter([{ key: 'department', operator: 'not', values: ['TECH'] }])).toBeNull()
    expect(departmentFromFilter([{ key: 'kind', operator: 'is', values: ['BRIEF'] }])).toBeNull()
  })
})

describe('the screens', () => {
  const EDITOR = 'app/components/training/ModuleEditor.vue'
  const PLANNER = 'app/pages/training/manage/sessions/index.vue'

  test('a new module is added and published, or saved as a draft, from the same form, with no sort field', async () => {
    const source = await Bun.file(EDITOR).text()
    expect(source).toContain('data-test="module-publish"')
    expect(source).toContain('data-test="module-draft"')
    expect(source).not.toContain('data-test="module-sort"')
    expect(source).toMatch(/v-if="module"[\s\S]{0,200}name="status"/)
  })

  test('the planner lists drafts through the one helper', async () => {
    expect(await Bun.file(PLANNER).text()).toContain('plannerModuleOptions(')
  })
})
