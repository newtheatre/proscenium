// Where a "record from a source" question may choose from. These are core's records; a module adds
// its own through forms' sources point when slots and sources are built (slice 6).
export const CORE_SOURCES = ['core.person', 'core.production', 'core.performance', 'core.venue', 'core.space'] as const
