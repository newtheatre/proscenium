/**
 * Column allow-lists for the public What's On endpoints.
 *
 * `/api/whats-on` and `/api/whats-on/:slug` are unauthenticated and served with
 * `Cache-Control: public, s-maxage=300`, so whatever they return is also cached
 * at the edge for anyone to fetch. Both used to spread the raw rows
 * (`...show`, `...perf`), which published `performances.notes` — declared in the
 * schema as "Internal production notes, not shown to customers" — along with
 * every other column added to either table since.
 *
 * Allow-list rather than deny-list, so a new column is private until someone
 * decides otherwise, and shared between the two endpoints so they cannot drift.
 */

/** Show columns the public may see. */
export const publicShowColumns = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  description: true,
  longDescription: true,
  posterUrl: true,
  programmeUrl: true,
  externalUrl: true,
  contentWarningNotes: true,
  warningsConfirmedNone: true,
  categoryId: true,
  seasonId: true,
} as const

/**
 * Content warning link columns the public may see — the level, and nothing else.
 *
 * The link row carries `id`, `showId` and `contentWarningId`, none of which mean
 * anything outside the admin section, and all of which used to ship because this
 * relation was the one place that spread the raw row.
 */
export const publicContentWarningLinkColumns = {
  level: true,
} as const

/** Vocabulary columns the public may see. */
export const publicContentWarningColumns = {
  id: true,
  slug: true,
  title: true,
  kind: true,
  category: true,
  description: true,
  icon: true,
  sort: true,
} as const

/** Performance columns the public may see. Note the absence of `notes`. */
export const publicPerformanceColumns = {
  id: true,
  showId: true,
  venueId: true,
  startsAt: true,
  doorsAt: true,
  durationMinutes: true,
  intervalCount: true,
  intervalMinutes: true,
  capacityOverride: true,
  bookingClosesHoursBefore: true,
  status: true,
} as const
