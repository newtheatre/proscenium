// Pairs a card reader with a provider account, from the code the reader shows.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { pairReader } from '../../../../readers'

export default defineRoute({
  ability: 'payments.provider.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    pairingCode: z.string().trim().regex(/^[A-Za-z0-9]{8,9}$/), // not-policy: the reader shows 8 or 9 letters and digits
    label: z.string().trim().min(1).max(80), // not-policy: a short name such as "Foyer reader"
  }).strict(),
}, async (event, { input, unit }) => ({ readerId: await pairReader(unit.view(), getRouterParam(event, 'id') ?? '', input) }))
