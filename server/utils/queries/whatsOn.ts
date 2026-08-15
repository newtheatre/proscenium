/**
 * Allow-lists for the public, edge-cached What's On endpoints. Allow-list,
 * not deny-list, so a new column is private until someone decides otherwise.
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
 * The level and nothing else — the link row's ids mean nothing outside the
 * admin section.
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
