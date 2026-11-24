// The bounds of a tax code, shared by the Tax codes screen and its routes (F-A2).
import { z } from 'zod'

export const TAX_CODE_INPUT = {
  code: z.string().trim().regex(/^[a-z][a-z0-9-]{0,29}$/), // not-policy: the shape of a code
  label: z.string().trim().min(1).max(60), // not-policy: a label's bound
  // Basis points: 2000 is 20%. Nothing charges more than the price.
  rate: z.number().int().min(0).max(10000), // not-policy: a percentage's bounds
}
