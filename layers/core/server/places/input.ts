// The shapes the places routes accept, shared so a create and an edit agree on every bound.
import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).transform(v => v || null).nullable()

const venueFields = z.object({
  name: z.string().trim().min(1).max(120), // not-policy: a place name's bounds
  addressLines: text(300).optional(), // not-policy: an address's bound
  locality: text(120).optional(), // not-policy: a town's bound
  postcode: text(20).optional(), // not-policy: a postcode's bound
  country: z.string().regex(/^[A-Z]{2}$/).nullable().optional(), // not-policy: an ISO 3166 country code
  latitude: z.number().min(-90).max(90).nullable().optional(), // not-policy: a latitude's range
  longitude: z.number().min(-180).max(180).nullable().optional(), // not-policy: a longitude's range
  description: text(4000).optional(), // not-policy: public text's bound
  accessInfo: text(4000).optional(), // not-policy: access text's bound
  gettingHere: text(4000).optional(), // not-policy: directions' bound
})

const POSITION = { message: 'Give both latitude and longitude, or neither.', path: ['longitude'] }
export const venueInput = venueFields.refine(v => (v.latitude == null) === (v.longitude == null), POSITION)
// An edit that touches the position gives both halves of it.
export const venuePatch = venueFields.partial().refine(v => (v.latitude === undefined) === (v.longitude === undefined) && (v.latitude === null) === (v.longitude === null), POSITION)

export const spaceInput = z.object({
  name: z.string().trim().min(1).max(120), // not-policy: a place name's bounds
  kindTermId: z.string().min(1),
  defaultCapacity: z.number().int().positive().max(100000).nullable().optional(), // not-policy: a sane ceiling on a room's capacity
  performable: z.boolean().optional(),
  exclusive: z.boolean().optional(),
  description: text(4000).optional(), // not-policy: public text's bound
  accessInfo: text(4000).optional(), // not-policy: access text's bound
  managed: z.boolean().optional(),
  findingIt: text(200).optional(), // not-policy: a finding-it note's bound (R-36)
})

export const placeAccessInput = z.object({
  spaceId: z.string().nullable().default(null),
  features: z.array(z.object({ termId: z.string().min(1), note: text(200).default(null) })).max(50), // not-policy: the note's bound; a list's ceiling
})

export const spacePatch = spaceInput.partial()
