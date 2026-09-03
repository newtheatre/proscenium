import { describe, expect, test } from 'bun:test'
import {
  assessmentProblem,
  contentWarningForm,
  levelProblem,
  publicContentWarnings,
  saysAssessment,
  saysWarningLevel,
  showWarningsForm,
  warningAssessment,
} from '#shared/utils/content-warnings'
import type { ShowContentWarning } from '#shared/utils/content-warnings'

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
