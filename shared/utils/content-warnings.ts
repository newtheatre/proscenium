import { z } from 'zod'
import { TO_BE_CONFIRMED } from './programme'

// What a show warns about, from a vocabulary rather than from prose (D-102). A warning is a row
// somebody chose, so two shows warning about the same thing say it in the same words.

export const CONTENT_WARNING_KINDS = ['TECHNICAL', 'GENERAL'] as const
export const CONTENT_WARNING_LEVELS = ['MENTIONED', 'DISCUSSED', 'DEPICTED'] as const

export type ContentWarningKind = (typeof CONTENT_WARNING_KINDS)[number]
export type ContentWarningLevel = (typeof CONTENT_WARNING_LEVELS)[number]

export const MAX_WARNING_TITLE = 80
export const MAX_WARNING_SLUG = 80
export const MAX_WARNING_NOTES = 2000

// How strongly a content warning features, strongest first, which is the order a show page reads
// them in: what is shown before what is talked about before what is only referred to.
export const CONTENT_WARNING_LEVEL_DETAILS: readonly { level: ContentWarningLevel, label: string, hint: string, icon: string }[] = [
  { level: 'DEPICTED', label: 'Depicted', hint: 'Shown as part of the action', icon: 'i-lucide-drama' },
  { level: 'DISCUSSED', label: 'Discussed', hint: 'Talked about at length, but not shown', icon: 'i-lucide-messages-square' },
  { level: 'MENTIONED', label: 'Mentioned', hint: 'Referred to in passing', icon: 'i-lucide-message-circle' },
]

// A staging warning has no level, so it is its own group with its own heading.
export const CONTENT_WARNING_STAGING_GROUP = { label: 'Staging', hint: 'What the production does to the room', icon: 'i-lucide-zap' } as const

// Suggested headings for content warnings, in display order. The column is plain text, so a
// heading nobody suggested is still allowed; it simply sorts after these.
export const CONTENT_WARNING_CATEGORIES = [
  'Violence and death',
  'Sexual content',
  'Mental health',
  'Substances',
  'Discrimination',
  'Language',
  'Family and relationships',
  'Health and body',
  'Other',
] as const

// A shortlist rather than free text: the value renders straight into a badge, where a typo is a
// blank space and not an error.
export const CONTENT_WARNING_ICONS = [
  'i-lucide-zap',
  'i-lucide-volume-2',
  'i-lucide-cloud-fog',
  'i-lucide-wind',
  'i-lucide-flame',
  'i-lucide-cigarette',
  'i-lucide-eye-off',
  'i-lucide-users',
  'i-lucide-swords',
  'i-lucide-heart-crack',
  'i-lucide-brain',
  'i-lucide-pill',
  'i-lucide-wine',
  'i-lucide-message-square-warning',
  'i-lucide-scale',
  'i-lucide-stethoscope',
  'i-lucide-ghost',
  'i-lucide-triangle-alert',
] as const

// The same shape a show slug takes: lowercase words joined by single hyphens.
export const WARNING_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const optionalText = (max: number) => z.string().trim().max(max).nullish()

export const contentWarningForm = z.object({
  slug: z.string().trim().min(1, 'A warning needs a slug').max(MAX_WARNING_SLUG)
    .refine(value => WARNING_SLUG.test(value), 'A slug is lowercase words joined by hyphens'),
  title: z.string().trim().min(1, 'A warning needs a title').max(MAX_WARNING_TITLE),
  kind: z.enum(CONTENT_WARNING_KINDS),
  category: optionalText(80),
  description: optionalText(500),
  icon: optionalText(80).refine(
    value => value == null || (CONTENT_WARNING_ICONS as readonly string[]).includes(value),
    'An icon comes from the shortlist',
  ),
  sort: z.number().int().min(0).max(9999).default(0),
  archived: z.boolean().default(false),
})

// Ids and a level, and no words of the show's own: free text as a warning is what D-102 criterion
// 1 refuses, so the schema is strict. Notes qualify the list (timings, how long) and are not one.
export const showWarningsForm = z.object({
  confirmedNone: z.boolean(),
  // Left out leaves the notes alone; blank clears them.
  notes: z.string().trim().max(MAX_WARNING_NOTES).nullish()
    .transform(value => (value === undefined ? undefined : value || null)),
  warnings: z.array(z.strictObject({
    warningId: z.string().trim().min(1, 'Say which content warning you mean'),
    level: z.enum(CONTENT_WARNING_LEVELS).nullable(),
  })).max(50)
    .refine(
      given => new Set(given.map(one => one.warningId)).size === given.length,
      'A show warns about a thing once',
    ),
}).strict()

export type ContentWarningInput = z.output<typeof contentWarningForm>
export type ShowWarningsInput = z.output<typeof showWarningsForm>

// One vocabulary entry, which is what the console reads.
export interface ContentWarning {
  id: string
  slug: string
  title: string
  kind: ContentWarningKind
  category: string | null
  description: string | null
  icon: string | null
  sort: number
  archived: boolean
  // Counted from the shows that carry it, so a vocabulary entry in use cannot be deleted.
  showCount: number
}

// A vocabulary entry as it sits on one show, which is the join both the console and the public
// page read.
export interface ShowContentWarning {
  id: string
  warningId: string
  slug: string
  title: string
  kind: ContentWarningKind
  category: string | null
  description: string | null
  icon: string | null
  sort: number
  archived: boolean
  level: ContentWarningLevel | null
}

// SQLite cannot state this: it correlates the junction's level with the vocabulary's kind, two
// tables (docs/data-model.md). The write path holds it, and this is that rule.
export function levelProblem(kind: ContentWarningKind, level: ContentWarningLevel | null): string | null {
  if (kind === 'GENERAL' && level === null) {
    return 'A general warning is graded mentioned, discussed or depicted'
  }
  if (kind === 'TECHNICAL' && level !== null) {
    return 'A technical warning is a fact about the staging, so it is not graded'
  }
  return null
}

export type WarningAssessment = 'WARNED' | 'CONFIRMED_NONE' | 'NOT_ASSESSED'

// Three states, not two: nobody having looked is not the same answer as somebody having looked
// and found nothing (D-102 criterion 2).
export function warningAssessment(show: { warningsConfirmedNone: boolean, warningCount: number }): WarningAssessment {
  if (show.warningCount > 0) return 'WARNED'
  return show.warningsConfirmedNone ? 'CONFIRMED_NONE' : 'NOT_ASSESSED'
}

export function assessmentProblem(confirmedNone: boolean, warningCount: number): string | null {
  if (confirmedNone && warningCount > 0) {
    return 'A show either has no warnings or has these ones; it cannot be confirmed clear and warned at once'
  }
  return null
}

export function saysWarningLevel(level: string | null): string | null {
  if (level === 'MENTIONED') return 'Mentioned'
  if (level === 'DISCUSSED') return 'Discussed'
  if (level === 'DEPICTED') return 'Depicted'
  return null
}

export function saysWarningKind(kind: string): string {
  return kind === 'TECHNICAL' ? 'Staging' : 'Content'
}

export function saysAssessment(assessment: WarningAssessment): string {
  if (assessment === 'CONFIRMED_NONE') return 'No content warnings; this show has been assessed'
  if (assessment === 'NOT_ASSESSED') return 'Content warnings have not been assessed yet'
  return 'Content warnings'
}

// The columns a visitor may see. Anything absent here is absent from every public payload, which
// is what an allow-list buys over a deny-list (CONTRIBUTING).
export interface PublicContentWarning {
  slug: string
  title: string
  kind: ContentWarningKind
  category: string | null
  description: string | null
  icon: string | null
  level: ContentWarningLevel | null
}

// Staging first, then the vocabulary's own order: whether the room strobes is what somebody
// decides on before they read what the play is about.
export function publicContentWarnings(warnings: ShowContentWarning[]): PublicContentWarning[] {
  return [...warnings]
    .sort((a, b) => Number(a.kind === 'GENERAL') - Number(b.kind === 'GENERAL')
      || a.sort - b.sort
      || a.title.localeCompare(b.title))
    .map(warning => ({
      slug: warning.slug,
      title: warning.title,
      kind: warning.kind,
      category: warning.category,
      description: warning.description,
      icon: warning.icon,
      level: warning.level,
    }))
}

// One show's warnings as a visitor reads them, wherever they are read: the show page, the listing
// and a booking all project the same rows the same way (D-102 criteria 2 and 4).
export function visitorWarnings(confirmedNone: boolean, carried: ShowContentWarning[]): {
  assessment: WarningAssessment
  warnings: PublicContentWarning[]
} {
  return {
    assessment: warningAssessment({ warningsConfirmedNone: confirmedNone, warningCount: carried.length }),
    warnings: publicContentWarnings(carried),
  }
}

// What a booker is told before they come, from the show's own rows (D-102 criterion 4).
export interface ShowGuidance {
  ageGuidance: string | null
  assessment: WarningAssessment
  warnings: Pick<PublicContentWarning, 'title' | 'level' | 'kind'>[]
}

// In the same words on the booking form, the booking page and the email (issue 1330): the age
// guidance first, then each warning in the show page's own grouping, or whether anybody has looked.
export function saysShowGuidance(guidance: ShowGuidance): string[] {
  const age = `Age guidance: ${guidance.ageGuidance ?? TO_BE_CONFIRMED}`
  if (guidance.assessment === 'CONFIRMED_NONE') return [age, `${saysAssessment('CONFIRMED_NONE')}.`]
  if (guidance.assessment === 'NOT_ASSESSED') {
    return [age, `${saysAssessment('NOT_ASSESSED')}. Ask the box office if it matters to you.`]
  }
  const named = groupContentWarnings(guidance.warnings).flatMap(group => group.warnings).map((warning) => {
    const level = saysWarningLevel(warning.level)
    return level ? `${warning.title}: ${level.toLowerCase()}` : warning.title
  })
  return [age, `Content warnings: ${named.join('; ')}`]
}

export interface ContentWarningGroup<T> {
  key: 'TECHNICAL' | ContentWarningLevel
  label: string
  hint: string
  icon: string
  warnings: T[]
}

// Staging first, then the strongest claim first, and nothing shown empty. The listing and the
// console read the same grouping, so a warning sits in the same place on both.
export function groupContentWarnings<T extends { kind: ContentWarningKind, level: ContentWarningLevel | null, title: string, sort?: number }>(
  warnings: T[],
): ContentWarningGroup<T>[] {
  const ordered = [...warnings].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.title.localeCompare(b.title))
  const groups: ContentWarningGroup<T>[] = [
    { key: 'TECHNICAL', ...CONTENT_WARNING_STAGING_GROUP, warnings: ordered.filter(one => one.kind === 'TECHNICAL') },
    ...CONTENT_WARNING_LEVEL_DETAILS.map(detail => ({
      key: detail.level,
      label: detail.label,
      hint: detail.hint,
      icon: detail.icon,
      warnings: ordered.filter(one => one.kind === 'GENERAL' && one.level === detail.level),
    })),
  ]
  return groups.filter(group => group.warnings.length > 0)
}

const categoryRank = (category: string): number => {
  const index = (CONTENT_WARNING_CATEGORIES as readonly string[]).indexOf(category)
  return index === -1 ? CONTENT_WARNING_CATEGORIES.length : index
}

// The content vocabulary under its headings, suggested ones first in their own order, the rest
// alphabetically after. Staging warnings are left out: they are their own group on every screen.
export function vocabularyByCategory<T extends { kind: ContentWarningKind, category: string | null, title: string, sort: number }>(
  vocabulary: T[],
): { category: string, warnings: T[] }[] {
  const held = new Map<string, T[]>()
  for (const warning of vocabulary) {
    if (warning.kind !== 'GENERAL') continue
    const category = warning.category ?? 'Other'
    held.set(category, [...(held.get(category) ?? []), warning])
  }
  return [...held.entries()]
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
    .map(([category, warnings]) => ({
      category,
      warnings: [...warnings].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title)),
    }))
}

// A content warning picked and not yet graded. Nothing is defaulted: a silent "depicted" is a claim
// about the production that nobody made, so the screen names these and refuses to save past them.
export function ungradedWarnings(chosen: { title: string, kind: ContentWarningKind, level: ContentWarningLevel | null }[]): string[] {
  return chosen.filter(one => one.kind === 'GENERAL' && one.level === null).map(one => one.title)
}
