// Adds or changes a sender identity: a display name and the part before the @ (C-32).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'

const KEY = /^[a-z][a-z0-9-]{0,39}$/ // not-policy: a short key

export default defineRoute({
  ability: 'core.sender.manage',
  rateLimit: 'write',
  input: z.object({
    displayName: z.string().trim().min(1).max(60), // not-policy: the specification's column limit
    localPart: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/), // not-policy: RFC 5321's 64-character local part
    replyTo: z.email().nullable().optional(),
    state: z.enum(['active', 'retired']).optional(),
  }),
}, async (event, { input, unit }) => {
  const key = getRouterParam(event, 'key') ?? ''
  if (!KEY.test(key)) refuse('core.senders.bad-key', 'A sender key is lower-case letters, digits and hyphens.', { status: 422, fields: { key: 'invalid' } })
  if (key === 'default' && input.state === 'retired') refuse('core.senders.default-required', 'The default sender cannot be retired.', { status: 409 })
  unit.add({
    sql: 'INSERT INTO core_sender_identities (key, display_name, local_part, reply_to, state) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET display_name = excluded.display_name, local_part = excluded.local_part, reply_to = excluded.reply_to, state = excluded.state',
    params: [key, input.displayName, input.localPart, input.replyTo ?? null, input.state ?? 'active'],
  })
  unit.audit({ action: 'update', record: ['core.sender', key] })
  return { key }
})
