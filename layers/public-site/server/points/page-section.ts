// Contract for public-site.production-section and public-site.venue-section (C-69): a block of a
// module's own drawn on a production's or a venue's public page, after the credits or the venue's details.
export interface PageSection {
  /** A component in a layer's app/public-sections folder, given the record's id as `id`; it fetches its own public data. */
  component: string
  /** Lowest first. */
  order?: number
  /** Whether the record has anything to show: one cheap read, so a page with nothing to add pays nothing more. */
  appliesTo: (id: string) => Promise<boolean>
}
