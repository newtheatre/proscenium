import { z } from 'zod'

// What a show warns about, from a vocabulary rather than from prose (D-102). A warning is a row
// somebody chose, so two shows warning about the same thing say it in the same words.

export const CONTENT_WARNING_KINDS = ['TECHNICAL', 'GENERAL'] as const
export const CONTENT_WARNING_LEVELS = ['MENTIONED', 'DISCUSSED', 'DEPICTED'] as const

export type ContentWarningKind = (typeof CONTENT_WARNING_KINDS)[number]
export type ContentWarningLevel = (typeof CONTENT_WARNING_LEVELS)[number]

export const MAX_WARNING_TITLE = 80
export const MAX_WARNING_SLUG = 80

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
  icon: optionalText(80),
  sort: z.number().int().min(0).max(9999).default(0),
  archived: z.boolean().default(false),
})

// Ids and a level, and nothing a person could type: free text here is what D-102 criterion 1
// refuses, so the schema is strict rather than merely unused.
export const showWarningsForm = z.object({
  confirmedNone: z.boolean(),
  warnings: z.array(z.strictObject({
    warningId: z.string().trim().min(1),
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
