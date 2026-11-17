// What a webhook is made of (C-49), shared by the routes and the Webhooks screen's form.
import { z } from 'zod'

export const FORMATS = ['json', 'discord', 'slack'] as const

export const webhookInput = z.object({
  name: z.string().trim().min(1).max(60), // not-policy: the table's bounds on a name
  url: z.string().trim().min(1).max(2000), // not-policy: a sane bound on an address
  format: z.enum(FORMATS),
  events: z.array(z.string().min(1).max(120)).min(1).max(500), // not-policy: bounds on the event list
})
export const webhookPatch = webhookInput.partial()
