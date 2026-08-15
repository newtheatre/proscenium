/**
 * The shapes /api/shows puts on the wire. Hand-written, not derived: these
 * rows carry computed fields no column corresponds to.
 */

// Imported explicitly: Nuxt's auto-imports cover app/ and server/, not files
// inside shared/ itself.
import type { ContentWarningKind, ContentWarningLevel } from '../utils/contentWarnings'

export interface VenueRef {
  id: string
  name: string
  capacity?: number | null
}

export type ShowStatus = 'DRAFT' | 'PUBLISHED'
export type PerformanceStatus = 'DRAFT' | 'ON_SALE' | 'CANCELLED'

export interface PerformanceListItem {
  id: string
  showId: string
  venueId: string
  startsAt: number | string
  doorsAt?: number | string | null
  durationMinutes?: number | null
  intervalCount: number
  intervalMinutes?: number | null
  capacityOverride?: number | null
  status: PerformanceStatus
  notes?: string | null
  createdAt: string
  updatedAt: string
  venue?: VenueRef
  ticketTypeOverrideCount: number
  ticketsSold: number
  /**
   * Sub-row anchor, never present on a real performance — it exists so
   * `getSubRows` can be typed over the union without a cast.
   */
  performances?: never
}

export interface ShowListItem {
  id: string
  slug: string
  title: string
  subtitle?: string | null
  description?: string | null
  posterUrl?: string | null
  status: ShowStatus
  createdAt: string
  updatedAt: string
  performances: PerformanceListItem[]
  ticketTypeOverrideCount: number
  performanceCount: number
  firstPerformanceAt: string | null
  lastPerformanceAt: string | null
}

/** A vocabulary entry as it reaches the client. */
export interface ContentWarningRef {
  id: string
  slug: string
  title: string
  kind: ContentWarningKind
  category?: string | null
  description?: string | null
  icon?: string | null
  sort?: number
}

/**
 * One linked warning with its vocabulary entry resolved. `level` is null
 * exactly when the warning is TECHNICAL (ADR-0004).
 */
export interface ShowContentWarningLink {
  id: string
  contentWarningId: string
  level: ContentWarningLevel | null
  contentWarning?: ContentWarningRef
}

/**
 * As the public show page receives it — narrower on purpose, since the link
 * row's ids mean nothing outside the admin section.
 */
export interface PublicShowContentWarning {
  level: ContentWarningLevel | null
  contentWarning: ContentWarningRef
}

/** A pre-rework link that migration 0016 could not map onto the new vocabulary. */
export interface LegacyContentWarningLink {
  title: string
  /** The axis it sat on: ACTION, DIALOGUE or TECHNICAL. */
  kind: string
}

/**
 * What GET /api/shows/:id returns: every column, not the list projection.
 * Anything that edits a show must read from there (ADR-0017).
 */
export interface ShowDetail extends ShowListItem {
  longDescription?: string | null
  programmeUrl?: string | null
  externalUrl?: string | null
  contentWarningNotes?: string | null
  warningsConfirmedNone: boolean
  categoryId?: string | null
  seasonId?: string | null
  contentWarnings: ShowContentWarningLink[]
}

/** A row of the tree table: a show at depth 0, one of its performances at depth 1. */
export type ShowTreeRow = ShowListItem | PerformanceListItem

/**
 * One discriminated union and one `action` event rather than nine emits, so
 * the page gets a `switch` the compiler can check for exhaustiveness.
 */
export type ShowRowAction
  = | { type: 'open-show', show: ShowListItem }
    | { type: 'show-ticket-types', show: ShowListItem }
    | { type: 'add-performance', show: ShowListItem }
    | { type: 'delete-show', show: ShowListItem }
    | { type: 'edit-performance', performance: PerformanceListItem }
    | { type: 'performance-ticket-types', performance: PerformanceListItem, label: string, showTitle: string }
    | { type: 'cancel-performance', performance: PerformanceListItem, showStatus: ShowStatus }
    | { type: 'reinstate-performance', performance: PerformanceListItem, showStatus: ShowStatus }
    | { type: 'delete-performance', performance: PerformanceListItem }
