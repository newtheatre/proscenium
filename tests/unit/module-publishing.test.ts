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
  const OFFERED = ['TECH', 'FOH']

  test('one department asked for is the one chosen', () => {
    expect(departmentFromFilter([{ key: 'department', operator: 'is', values: ['TECH'] }], OFFERED)).toBe('TECH')
    expect(departmentFromFilter([{ key: 'department', operator: 'any', values: ['FOH'] }], OFFERED)).toBe('FOH')
  })

  test('no filter, several departments or an exclusion choose nothing', () => {
    expect(departmentFromFilter([], OFFERED)).toBeNull()
    expect(departmentFromFilter([{ key: 'department', operator: 'any', values: ['TECH', 'FOH'] }], OFFERED)).toBeNull()
    expect(departmentFromFilter([{ key: 'department', operator: 'not', values: ['TECH'] }], OFFERED)).toBeNull()
    expect(departmentFromFilter([{ key: 'kind', operator: 'is', values: ['BRIEF'] }], OFFERED)).toBeNull()
  })

  // A bookmark can name a department since retired, or one this reader does not lead.
  test('a department the list does not offer chooses nothing', () => {
    expect(departmentFromFilter([{ key: 'department', operator: 'is', values: ['OLD'] }], OFFERED)).toBeNull()
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

  // The first submit button is the form's default, which Enter in any field presses.
  test('Enter in a field saves a draft, never publishes', async () => {
    const source = await Bun.file(EDITOR).text()
    expect(source.indexOf('data-test="module-draft"')).toBeLessThan(source.indexOf('data-test="module-publish"'))
  })

  test('the planner and the session page list drafts through the one helper', async () => {
    const planner = await Bun.file(PLANNER).text()
    expect(planner).toContain('plannerModuleOptions(')
    expect(await Bun.file('app/pages/training/manage/sessions/[id].vue').text()).toContain('plannerModuleOptions(')
    expect(planner).toMatch(/v-if="teachable.length === 0 && drafts > 0"[\s\S]{0,600}data-test="sessions-only-drafts"/)
  })
})
