/**
 * The shapes `/api/shows` actually puts on the wire.
 *
 * Hand-written rather than derived with `InferSelectModel`, deliberately: the
 * Drizzle model describes the *table*, where `performances.startsAt` is a
 * `Date` rather than an ISO string, and these rows carry computed fields
 * (`ticketsSold`, `performanceCount`, the run window) that no column
 * corresponds to.
 *
 * In `shared/` so the page, the tree table and the row-action handlers agree
 * on one definition.
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
   * Sub-row anchor. Never present on a real performance — it exists so the
   * tree table's `getSubRows` can be typed over the union without a cast at
   * every call site.
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
 * One linked content warning, with its vocabulary entry resolved.
 *
 * `level` is null exactly when the warning is TECHNICAL — a strobe sequence is
 * not "mentioned" or "depicted", it happens or it does not.
 */
export interface ShowContentWarningLink {
  id: string
  contentWarningId: string
  level: ContentWarningLevel | null
  contentWarning?: ContentWarningRef
}

/**
 * A linked warning as the public show page receives it.
 *
 * Narrower than `ShowContentWarningLink` on purpose: `/api/whats-on/:slug`
 * allow-lists the link row down to `level`, because `id`, `showId` and
 * `contentWarningId` mean nothing outside the admin section and that response
 * is cached at the edge for anyone to fetch.
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
 * What `GET /api/shows/:id` returns: every column, not the list projection.
 *
 * The five fields below `description` are the ones `/api/shows` omits. Anything
 * that edits a show must read them from here — writing back what a list row did
 * not contain is what silently wiped shows' write-ups.
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
 * Everything the tree table can ask the page to do.
 *
 * One discriminated union and one `action` event, rather than nine separate
 * emits: the page gets a `switch` the compiler can check for exhaustiveness, and
 * the modals stay mounted at page level where `refresh` lives.
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
