/**
 * The shapes /api/content-warnings puts on the wire. Hand-written rather than
 * derived, matching shared/types/shows.ts.
 */
import type { ContentWarningKind } from '../utils/contentWarnings'

/** A vocabulary entry as the admin page sees it. */
export interface AdminContentWarning {
  id: string
  slug: string
  title: string
  kind: ContentWarningKind
  category: string | null
  description: string | null
  icon: string | null
  sort: number
  /** Retired: not offered on new shows, still rendered on the ones that have it. */
  archived: boolean
  /** How many shows currently carry this warning. Blocks deletion when above zero. */
  showCount: number
}
