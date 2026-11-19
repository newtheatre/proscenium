// A ticket is named by its type alone; its section is named only where that type is sold in more
// than one section of the performance, so "Adult" stays "Adult" (Matt, 2026-11-19).

/** The ticket types sold in more than one section, from the performance's priced (band, type) pairs. */
export function typesInSeveralSections(pairs: Iterable<{ bandId: string, ticketTypeId: string }>): Set<string> {
  const seen = new Map<string, string>()
  const several = new Set<string>()
  for (const { bandId, ticketTypeId } of pairs) {
    const first = seen.get(ticketTypeId)
    if (first === undefined) seen.set(ticketTypeId, bandId)
    else if (first !== bandId) several.add(ticketTypeId)
  }
  return several
}
