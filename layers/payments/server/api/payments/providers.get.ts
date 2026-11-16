// The providers this site can use and the accounts configured with them. A provider missing a secret
// is unavailable, and says which secret (PAY-01).
import { all, defineRoute } from '#kit'
import { missingSecrets, providers, type ProviderAccountRow } from '../../providers'

export default defineRoute({ ability: 'payments.provider.manage', rateLimit: 'default' }, async () => {
  const known = await providers()
  const rows = await all<ProviderAccountRow>('SELECT * FROM payments_provider_accounts ORDER BY created_at')
  return {
    providers: await Promise.all([...known].map(async ([id, p]) => ({ id, capabilities: p.capabilities, methods: p.methods, pairsReaders: !!p.pairReader, missingSecrets: await missingSecrets(p) }))),
    accounts: rows.map(r => ({ id: r.id, provider: r.provider, label: r.label, channels: JSON.parse(r.channels) as string[], mode: r.mode, externalRef: r.external_ref, active: r.active === 1 })),
  }
})
