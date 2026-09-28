import { describe, expect, test } from 'bun:test'
import { backlogProblems, countModule } from '../../scripts/lib/backlog-counts'

// The backlog index counts what its module files hold, by the rule stated beside its table
// (docs/backlog/README.md, issue 1531), so a story landing without its row fails `check docs`.

const story = (id: string, phase: string): string =>
  `## ${id}: A story\n\n- Role: Member\n- Phase: ${phase}\n- Story: As a member, I want it.\n`

const IDENTITY = [
  '# Module A: Identity\n\n**Counts: 2 MVP, 1 V2, 1 Later, 1 resolved.**\n',
  story('A-101', 'MVP'),
  story('A-102', 'MVP'),
  story('A-103', 'Resolved, won\'t build (SP-4 outcome,\n  26 August 2026)'),
  story('A-201', 'V2'),
  story('A-301', 'Later'),
].join('\n')

const BAR = ['# Module F: Bar\n', story('F-101', 'MVP'), story('F-201', 'V2')].join('\n')

const MODULES = { 'A-identity.md': IDENTITY, 'F-bar.md': BAR }

const index = (identity: string, total = '**3** | **2** | **1** | **1** | **7**', opening = '7 stories across 2 modules.'): string => `# Backlog index

${opening} Detailed stories carry testable acceptance criteria.

| File | Module | MVP | V2 | Later | Resolved | Total |
| --- | --- | --- | --- | --- | --- | --- |
| \`A-identity.md\` | Identity, membership and privacy | ${identity} |
| \`F-bar.md\` | Bar | 1 | 1 | 0 | 0 | 2 |
| **Total** | | ${total} |

The resolved stories: A-103 was resolved as won't-build.
`

describe('a module file\'s stories and their phases', () => {
  test('a story counts under the first word of its phase line, and a resolved one only in the total', () => {
    expect(countModule(IDENTITY)).toEqual({
      counts: { mvp: 2, v2: 1, later: 1, resolved: 1, total: 5 },
      resolved: ['A-103'],
      problems: [],
    })
  })

  test('the phase line decides, not the id\'s range, because a re-phased story keeps its id', () => {
    expect(countModule(story('D-205', 'MVP')).counts).toEqual({ mvp: 1, v2: 0, later: 0, resolved: 0, total: 1 })
  })

  test('a story with no phase line, or a phase the rule does not know, is named', () => {
    const source = `## E-101: No phase\n\n- Role: Member\n\n${story('E-102', 'Maybe')}`
    expect(countModule(source).problems).toEqual([
      'E-101 has no Phase line',
      'E-102 phase "Maybe" is not MVP, V2, Later or Resolved',
    ])
  })

  test('a phase line in the prose above the stories counts nothing', () => {
    expect(countModule('# Module H\n\n- Phase: MVP\n\nStories: 0.\n').counts.total).toBe(0)
  })
})

describe('the backlog index agrees with its module files', () => {
  test('a table that counts what the files hold passes', () => {
    expect(backlogProblems(index('2 | 1 | 1 | 1 | 5'), MODULES)).toEqual([])
  })

  test('a drifted row fails, naming the module and both figures', () => {
    const problems = backlogProblems(index('1 | 1 | 1 | 1 | 4', '**2** | **2** | **1** | **1** | **6**'), MODULES)
    expect(problems).toContain('A-identity.md MVP: the table says 1, the file holds 2')
    expect(problems).toContain('A-identity.md Total: the table says 4, the file holds 5')
    expect(problems).toContain('Total MVP: the table says 2, the files hold 3')
    expect(problems).toContain('Total Total: the table says 6, the files hold 7')
    expect(problems).toHaveLength(4)
  })

  test('a total row left behind by a correct row fails on its own', () => {
    expect(backlogProblems(index('2 | 1 | 1 | 1 | 5', '**2** | **2** | **1** | **1** | **6**'), MODULES)).toEqual([
      'Total MVP: the table says 2, the files hold 3',
      'Total Total: the table says 6, the files hold 7',
    ])
  })

  test('an opening count that disagrees fails', () => {
    expect(backlogProblems(index('2 | 1 | 1 | 1 | 5', undefined, '6 stories across 3 modules.'), MODULES)).toEqual([
      'the opening count says 6 stories, the files hold 7',
      'the opening count says 3 modules, there are 2 module files',
    ])
  })

  test('a module file with no row, and a row with no file, both fail', () => {
    const problems = backlogProblems(index('2 | 1 | 1 | 1 | 5'), { ...MODULES, 'C-spaces.md': story('C-101', 'MVP') })
    expect(problems).toContain('C-spaces.md has no row in the table')
    expect(backlogProblems(index('2 | 1 | 1 | 1 | 5'), { 'A-identity.md': IDENTITY })).toContain('F-bar.md has a row but no module file')
  })

  test('a resolved story the index does not name fails', () => {
    const readme = index('2 | 1 | 1 | 1 | 5').replace('A-103 was resolved', 'one story was resolved')
    expect(backlogProblems(readme, MODULES)).toEqual(['A-103 is resolved in A-identity.md but the index does not name it'])
  })

  test('a module file\'s own phase problems are reported against it', () => {
    const broken = `${BAR}\n## F-102: No phase\n\n- Role: Member\n`
    expect(backlogProblems(index('2 | 1 | 1 | 1 | 5'), { ...MODULES, 'F-bar.md': broken })).toContain('F-bar.md F-102 has no Phase line')
  })
})
