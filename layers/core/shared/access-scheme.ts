// The access scheme's seeded entries that its form asks about in its own words rather than as ticks
// (identity part 3, "Storage and sharing"). Shared so the form and the server agree.

/** Asked as "I use a wheelchair", then one or the other. */
export const WHEELCHAIR = { stays: 'wheelchair-stays', transfers: 'wheelchair-transfers' } as const

/** Set from the companions question and from "anything else"; never ticked. */
export const DERIVED = { companion: 'essential-companion', other: 'other' } as const

/** The entries the tick list leaves out, because the form asks about them another way. */
export const NOT_TICKED: readonly string[] = [WHEELCHAIR.stays, WHEELCHAIR.transfers, DERIVED.companion, DERIVED.other]
