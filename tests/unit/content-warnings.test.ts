import { describe, expect, test } from 'bun:test'
import {
  CONTENT_WARNING_CATEGORIES,
  CONTENT_WARNING_ICONS,
  assessmentProblem,
  contentWarningForm,
  groupContentWarnings,
  levelProblem,
  publicContentWarnings,
  saysAssessment,
  saysWarningLevel,
  showWarningsForm,
  ungradedWarnings,
  vocabularyByCategory,
  warningAssessment,
} from '#shared/utils/content-warnings'
import type { ContentWarning, PublicContentWarning, ShowContentWarning } from '#shared/utils/content-warnings'

// The warnings vocabulary as pure rules (D-102). What the write path refuses over the live rows is
// in tests/integration/content-warnings.test.ts.

describe('a warning comes from the vocabulary, never from free text (D-102 criterion 1)', () => {
  test('the show write path takes warning ids and a level, and no words at all', () => {
    const parsed = showWarningsForm.safeParse({
      confirmedNone: false,
      warnings: [{ warningId: 'w-death', level: 'DEPICTED' }],
    })
    expect(parsed.success).toBe(true)
  })

  test('a typed warning is refused rather than stored beside the vocabulary', () => {
    const parsed = showWarningsForm.safeParse({
      confirmedNone: false,
      warnings: [{ warningId: 'w-death', level: 'DEPICTED', title: 'Some upsetting scenes' }],
    })
    expect(parsed.success).toBe(false)
  })

  test('a level outside the three is refused', () => {
    const parsed = showWarningsForm.safeParse({
      confirmedNone: false,
      warnings: [{ warningId: 'w-death', level: 'HINTED' }],
    })
    expect(parsed.success).toBe(false)
  })

  test('the same warning cannot be given twice on one show', () => {
    const parsed = showWarningsForm.safeParse({
      confirmedNone: false,
      warnings: [{ warningId: 'w-death', level: 'DEPICTED' }, { warningId: 'w-death', level: 'MENTIONED' }],
    })
    expect(parsed.success).toBe(false)
  })

  test('a vocabulary entry needs a slug, a title and one of the two kinds', () => {
    expect(contentWarningForm.safeParse({ slug: 'strobe-lighting', title: 'Strobe lighting', kind: 'TECHNICAL' }).success).toBe(true)
    expect(contentWarningForm.safeParse({ slug: 'Strobe Lighting', title: 'Strobe lighting', kind: 'TECHNICAL' }).success).toBe(false)
    expect(contentWarningForm.safeParse({ slug: 'strobe', title: '', kind: 'TECHNICAL' }).success).toBe(false)
    expect(contentWarningForm.safeParse({ slug: 'strobe', title: 'Strobe', kind: 'SPICY' }).success).toBe(false)
  })

  // A technical warning is a fact about the room and a general one is graded. This correlates two
  // tables, which SQLite cannot state, so the write path holds it (docs/data-model.md).
  test('a level is required exactly when the warning is general', () => {
    expect(levelProblem('GENERAL', 'DEPICTED')).toBeNull()
    expect(levelProblem('TECHNICAL', null)).toBeNull()
    expect(levelProblem('GENERAL', null)).toBe('A general warning is graded mentioned, discussed or depicted')
    expect(levelProblem('TECHNICAL', 'DEPICTED')).toBe('A technical warning is a fact about the staging, so it is not graded')
  })

  test('each level says something a theatregoer can weigh', () => {
    expect(saysWarningLevel('MENTIONED')).toBe('Mentioned')
    expect(saysWarningLevel('DISCUSSED')).toBe('Discussed')
    expect(saysWarningLevel('DEPICTED')).toBe('Depicted')
    expect(saysWarningLevel(null)).toBeNull()
  })
})

describe('confirmed none is not the same as not yet assessed (D-102 criterion 2)', () => {
  test('warnings on the show is the third state, whatever the flag says', () => {
    expect(warningAssessment({ warningsConfirmedNone: false, warningCount: 2 })).toBe('WARNED')
  })

  test('no warnings and the confirmation is a decision somebody took', () => {
    expect(warningAssessment({ warningsConfirmedNone: true, warningCount: 0 })).toBe('CONFIRMED_NONE')
  })

  test('no warnings and no confirmation is nobody having looked', () => {
    expect(warningAssessment({ warningsConfirmedNone: false, warningCount: 0 })).toBe('NOT_ASSESSED')
  })

  test('the two empty states read differently to a reader', () => {
    expect(saysAssessment('CONFIRMED_NONE')).toBe('No content warnings; this show has been assessed')
    expect(saysAssessment('NOT_ASSESSED')).toBe('Content warnings have not been assessed yet')
    expect(saysAssessment('WARNED')).toBe('Content warnings')
  })

  // Confirming none while carrying warnings is two answers to one question, so the write path
  // refuses it rather than picking one.
  test('confirming none while listing warnings is refused', () => {
    expect(assessmentProblem(true, 0)).toBeNull()
    expect(assessmentProblem(false, 2)).toBeNull()
    expect(assessmentProblem(false, 0)).toBeNull()
    expect(assessmentProblem(true, 2))
      .toBe('A show either has no warnings or has these ones; it cannot be confirmed clear and warned at once')
  })
})

describe('the public payload carries the vocabulary and nothing internal', () => {
  const rows: ShowContentWarning[] = [
    {
      id: 'scw-1',
      warningId: 'w-death',
      slug: 'death',
      title: 'Death',
      kind: 'GENERAL',
      category: 'Distressing content',
      description: 'A death happens on stage.',
      icon: 'i-lucide-heart-crack',
      sort: 10,
      archived: false,
      level: 'DEPICTED',
    },
    {
      id: 'scw-2',
      warningId: 'w-strobe',
      slug: 'strobe',
      title: 'Strobe lighting',
      kind: 'TECHNICAL',
      category: null,
      description: null,
      icon: null,
      sort: 2,
      archived: false,
      level: null,
    },
  ]

  test('a public warning carries no internal id and no archive flag', () => {
    const [first] = publicContentWarnings(rows.slice(0, 1))
    expect(Object.keys(first ?? {}).sort())
      .toEqual(['category', 'description', 'icon', 'kind', 'level', 'slug', 'title'])
  })

  // Technical first: whether the room strobes is what somebody decides on before they read what
  // the play is about.
  test('technical warnings lead, then the vocabulary\'s own order', () => {
    expect(publicContentWarnings(rows).map(warning => warning.slug)).toEqual(['strobe', 'death'])
  })
})

describe('the show page groups what it warns about the way a theatregoer reads it', () => {
  const warning = (over: Partial<PublicContentWarning>): PublicContentWarning => ({
    slug: 'x',
    title: 'X',
    kind: 'GENERAL',
    category: null,
    description: null,
    icon: null,
    level: 'MENTIONED',
    ...over,
  })

  // Staging first, then the strongest claim first: what is done to the room, then what is shown,
  // then what is talked about, then what is only referred to.
  test('staging leads, then depicted, discussed and mentioned, in that order', () => {
    const grouped = groupContentWarnings([
      warning({ slug: 'grief', title: 'Grief', level: 'MENTIONED' }),
      warning({ slug: 'death', title: 'Death', level: 'DEPICTED' }),
      warning({ slug: 'strobe', title: 'Strobe lighting', kind: 'TECHNICAL', level: null }),
      warning({ slug: 'war', title: 'War', level: 'DISCUSSED' }),
    ])
    expect(grouped.map(group => group.key)).toEqual(['TECHNICAL', 'DEPICTED', 'DISCUSSED', 'MENTIONED'])
    expect(grouped.map(group => group.warnings.map(one => one.slug))).toEqual([['strobe'], ['death'], ['war'], ['grief']])
  })

  test('a group nothing falls into is left out rather than shown empty', () => {
    const grouped = groupContentWarnings([warning({ slug: 'death', title: 'Death', level: 'DEPICTED' })])
    expect(grouped.map(group => group.key)).toEqual(['DEPICTED'])
  })

  test('each group says in words what belonging to it means', () => {
    const grouped = groupContentWarnings([
      warning({ slug: 'strobe', kind: 'TECHNICAL', level: null }),
      warning({ slug: 'death', level: 'DEPICTED' }),
    ])
    expect(grouped.map(group => group.label)).toEqual(['Staging', 'Depicted'])
    expect(grouped.map(group => group.hint)).toEqual(['What the production does to the room', 'Shown as part of the action'])
    expect(grouped.every(group => group.icon.startsWith('i-lucide-'))).toBe(true)
  })

  test('within a group the vocabulary\'s own order holds, then the title', () => {
    const grouped = groupContentWarnings([
      warning({ slug: 'b', title: 'B', level: 'DEPICTED' }),
      warning({ slug: 'a', title: 'A', level: 'DEPICTED' }),
    ])
    expect(grouped[0]?.warnings.map(one => one.slug)).toEqual(['a', 'b'])
  })
})

describe('the editor offers the vocabulary by category, and refuses a level nobody chose', () => {
  const entry = (over: Partial<ContentWarning>): ContentWarning => ({
    id: over.slug ?? 'x',
    slug: 'x',
    title: 'X',
    kind: 'GENERAL',
    category: null,
    description: null,
    icon: null,
    sort: 0,
    archived: false,
    showCount: 0,
    ...over,
  })

  // The suggested categories come first in their own order; one somebody typed sorts after them,
  // and an entry with none is offered under Other rather than dropped.
  test('content warnings group under their category in the suggested order, the unfamiliar last', () => {
    const grouped = vocabularyByCategory([
      entry({ slug: 'loneliness', title: 'Loneliness', category: null }),
      entry({ slug: 'grief', title: 'Grief', category: 'Mental health' }),
      entry({ slug: 'murder', title: 'Murder', category: 'Violence and death' }),
      entry({ slug: 'clowns', title: 'Clowns', category: 'Phobias' }),
      entry({ slug: 'strobe', title: 'Strobe lighting', kind: 'TECHNICAL' }),
    ])
    expect(grouped.map(group => group.category)).toEqual(['Violence and death', 'Mental health', 'Other', 'Phobias'])
    expect(grouped.flatMap(group => group.warnings.map(one => one.slug))).toEqual(['murder', 'grief', 'loneliness', 'clowns'])
  })

  test('a staging warning is never in a category group, because it is its own group', () => {
    const grouped = vocabularyByCategory([entry({ slug: 'strobe', kind: 'TECHNICAL', category: 'Lighting' })])
    expect(grouped).toEqual([])
  })

  // A silent default is a claim about a production nobody made, so the screen names what is still
  // to be graded rather than picking for the company (0004 in the old estate's records).
  test('a content warning picked without a level is named as still to grade', () => {
    expect(ungradedWarnings([
      { title: 'Death', kind: 'GENERAL', level: null },
      { title: 'Strobe lighting', kind: 'TECHNICAL', level: null },
      { title: 'War', kind: 'GENERAL', level: 'DISCUSSED' },
    ])).toEqual(['Death'])
  })
})

describe('notes qualify the list and are never a warning of their own', () => {
  // The list cannot say when the strobe comes or how long it lasts. Notes can, beside it, without
  // becoming a warning nobody else can compare against.
  test('the show write path takes notes beside the ids, within a bound', () => {
    expect(showWarningsForm.safeParse({ confirmedNone: false, warnings: [], notes: 'The strobe sequence lasts about 20 seconds in Act 2.' }).success).toBe(true)
    expect(showWarningsForm.safeParse({ confirmedNone: false, warnings: [], notes: null }).success).toBe(true)
    expect(showWarningsForm.safeParse({ confirmedNone: false, warnings: [], notes: 'x'.repeat(2001) }).success).toBe(false)
  })

  test('omitting the notes leaves them alone, and blank clears them', () => {
    expect(showWarningsForm.parse({ confirmedNone: false, warnings: [] }).notes).toBeUndefined()
    expect(showWarningsForm.parse({ confirmedNone: false, warnings: [], notes: '   ' }).notes).toBeNull()
  })

  test('notes on a show with no rows and no confirmation still leave it not assessed', () => {
    expect(warningAssessment({ warningsConfirmedNone: false, warningCount: 0 })).toBe('NOT_ASSESSED')
  })
})

describe('the vocabulary form offers an icon from a shortlist, never typed', () => {
  // The value renders straight into a badge, where a typo is a blank space and not an error.
  test('an icon outside the shortlist is refused', () => {
    expect(contentWarningForm.safeParse({ slug: 'strobe', title: 'Strobe', kind: 'TECHNICAL', icon: 'i-lucide-zap' }).success).toBe(true)
    expect(contentWarningForm.safeParse({ slug: 'strobe', title: 'Strobe', kind: 'TECHNICAL', icon: null }).success).toBe(true)
    expect(contentWarningForm.safeParse({ slug: 'strobe', title: 'Strobe', kind: 'TECHNICAL', icon: 'i-lucide-zapp' }).success).toBe(false)
  })

  test('the shortlist is what the picker offers', () => {
    expect(CONTENT_WARNING_ICONS).toContain('i-lucide-zap')
    expect(CONTENT_WARNING_CATEGORIES[0]).toBe('Violence and death')
  })
})
