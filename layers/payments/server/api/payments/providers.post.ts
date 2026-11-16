// Adds a provider account: one configured connection to a provider, with the channels it serves and
// whether it is live or test. A card provider gets its own clearing account in the ledger.
import { z } from 'zod'
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { ensureScopedAccount } from '#modules/finance'
import { providers } from '../../providers'

export default defineRoute({
  ability: 'payments.provider.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    provider: z.string().regex(/^[a-z][a-z0-9-]*$/), // not-policy: the shape of a contribution id
    label: z.string().trim().min(1).max(80), // not-policy: a label's bound
    channels: z.array(z.enum(['online', 'desk'])).min(1),
    mode: z.enum(['live', 'test']),
    externalRef: z.string().trim().max(200).optional(), // not-policy: a provider id's bound
  }),
}, async (_event, { input, unit }) => {
  const provider = (await providers()).get(input.provider)
  if (!provider) refuse('payments.provider.unknown', `There is no payment provider called ${input.provider}.`, { status: 422, fields: { provider: 'payments.provider.unknown' } })
  const offered = new Set(provider!.methods.flatMap(m => m.channels))
  const wrong = input.channels.filter(c => !offered.has(c))
  if (wrong.length) refuse('payments.provider.channel', `${input.provider} is not used ${wrong.join(' or ')}.`, { status: 422, fields: { channels: 'payments.provider.channel' } })
  if (input.mode === 'test' && !provider!.capabilities.includes('test-mode') && !provider!.capabilities.includes('attested')) refuse('payments.provider.no-test-mode', `${input.provider} has no test mode.`, { status: 422, fields: { mode: 'payments.provider.no-test-mode' } })
  const id = newId('ppa')
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, external_ref, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
    params: [id, input.provider, input.label, JSON.stringify([...new Set(input.channels)]), input.mode, input.externalRef ?? null, at, at],
  })
  if (provider!.methods.some(m => m.method !== 'cash')) await ensureScopedAccount(unit, 'payments.card-clearing', id, `Card clearing: ${input.label}`)
  unit.audit({ action: 'create', record: ['payments.provider-account', id] })
  return { providerAccountId: id }
})
