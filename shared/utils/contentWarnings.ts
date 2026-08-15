/**
 * The content-warning vocabulary, spoken by both the UI and the API
 * (ADR-0004). One definition rather than five. Auto-imported on both sides.
 */

export type ContentWarningKind = 'TECHNICAL' | 'GENERAL'
export type ContentWarningLevel = 'MENTIONED' | 'DISCUSSED' | 'DEPICTED'

/**
 * How intensely a general warning features, weakest to strongest. `rank`
 * orders them and resolves collisions — lowest wins.
 */
export const CONTENT_WARNING_LEVELS = [
  {
    value: 'DEPICTED' as const,
    label: 'Depicted',
    hint: 'Shown as part of the action',
    icon: 'i-lucide-drama',
    rank: 1,
  },
  {
    value: 'DISCUSSED' as const,
    label: 'Discussed',
    hint: 'Talked about at length, but not shown',
    icon: 'i-lucide-messages-square',
    rank: 2,
  },
  {
    value: 'MENTIONED' as const,
    label: 'Mentioned',
    hint: 'Referred to in passing',
    icon: 'i-lucide-message-circle',
    rank: 3,
  },
]

/** The technical group has no level, so it needs its own heading and blurb. */
export const CONTENT_WARNING_TECHNICAL_GROUP = {
  label: 'Technical effects',
  hint: 'What the production does to the room',
  icon: 'i-lucide-zap',
}

export const CONTENT_WARNING_KINDS = [
  { value: 'TECHNICAL' as const, label: 'Technical', hint: 'A production effect. No level — either the show does it or it does not.' },
  { value: 'GENERAL' as const, label: 'General', hint: 'A theme. Carries a level on each show that has it.' },
]

/**
 * Suggested groupings for GENERAL warnings, in display order. The column is
 * plain text, so a category can be added without a deploy.
 */
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
]

/**
 * A shortlist rather than free text: the value is rendered straight into
 * `UBadge :icon`, where a typo is a blank space, not an error.
 */
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
]

const LEVEL_BY_VALUE = new Map(CONTENT_WARNING_LEVELS.map(level => [level.value, level]))

/** The display metadata for a level, or undefined for an unrecognised one. */
export function contentWarningLevel(value: ContentWarningLevel | null | undefined) {
  return value ? LEVEL_BY_VALUE.get(value) : undefined
}

/** Position of a category in `CONTENT_WARNING_CATEGORIES`; unknown ones sort last. */
export function contentWarningCategoryRank(category: string | null | undefined): number {
  const index = category ? CONTENT_WARNING_CATEGORIES.indexOf(category) : -1
  return index === -1 ? CONTENT_WARNING_CATEGORIES.length : index
}

/**
 * Sort comparator for vocabulary entries within a group: `sort` first so a
 * warning can be pinned to the top, then title.
 */
export function compareContentWarnings(
  a: { sort?: number, title: string },
  b: { sort?: number, title: string },
): number {
  return (a.sort ?? 0) - (b.sort ?? 0) || a.title.localeCompare(b.title)
}

/** Lowercase, hyphenated, no punctuation — the shape `content_warnings.slug` expects. */
export function contentWarningSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
