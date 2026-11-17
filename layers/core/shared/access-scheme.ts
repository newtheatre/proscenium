// The access scheme's seeded entries that its form asks about in its own words rather than as ticks
// (identity part 3, "Storage and sharing"). Shared so the form and the server agree.
import { z } from 'zod'

/** Asked as "I use a wheelchair", then one or the other. */
export const WHEELCHAIR = { stays: 'wheelchair-stays', transfers: 'wheelchair-transfers' } as const

/** Set from the companions question and from "anything else"; never ticked. */
export const DERIVED = { companion: 'essential-companion', other: 'other' } as const

/** The entries the tick list leaves out, because the form asks about them another way. */
export const NOT_TICKED: readonly string[] = [WHEELCHAIR.stays, WHEELCHAIR.transfers, DERIVED.companion, DERIVED.other]

/** Somebody brought in by staff (ID-42), by email link or in person: what both routes and the dialogue check. */
export const accessPersonInput = z.object({
  name: z.string().trim().min(1).max(200), // not-policy: a person's name
  address: z.email().max(254), // not-policy: the longest address SMTP allows
}).strict()
