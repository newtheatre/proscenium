/**
 * The shapes `/api/shows` actually puts on the wire.
 *
 * Hand-written rather than derived with `InferSelectModel`, deliberately. The
 * Drizzle model is the *table*: `performances.startsAt` is a `Date` there and an
 * ISO string here, and these rows carry computed fields (`ticketsSold`,
 * `performanceCount`, the run window) that no column corresponds to. Deriving
 * from the schema would describe something the client never receives.
 *
 * They live in `shared/` so the page, the tree table and the row-action handlers
 * agree on one definition — `app/pages/admin/shows.vue` used to declare its own
 * `Show` and `Performance`, and so did four of the six modals it mounted. See
 * docs/09-known-issues.md #16.
 */

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

/** One linked content warning, with its vocabulary entry resolved. */
export interface ShowContentWarningLink {
  id: string
  contentWarningId: string
  kind: 'ACTION' | 'DIALOGUE' | 'TECHNICAL'
  contentWarning?: { id: string, title: string }
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
