/**
 * Map a raw venue row (with nested `venuesToFeatures` relation) to the API response shape.
 * Flattens the join-table structure into a `features` array.
 */
export function formatVenueResponse(
  venue: {
    venuesToFeatures: Array<{ feature: Record<string, unknown> }>
    [key: string]: unknown
  },
) {
  const { venuesToFeatures, ...rest } = venue
  return {
    ...rest,
    features: venuesToFeatures.map(vtf => vtf.feature),
  }
}
