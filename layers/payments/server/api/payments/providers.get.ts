// The providers this site can use and the accounts configured with them. An account missing a key is
// unavailable, and says which (PAY-01). Each account says where each of its keys comes from, and the
// last four characters of a saved one, never the key.
import { all, credentialStatus, defineRoute } from '#kit'
import { providers, type ProviderAccountRow } from '../../providers'

export default defineRoute({ ability: 'payments.provider.manage', rateLimit: 'default' }, async () => {
  const known = await providers()
  const rows = await all<ProviderAccountRow>('SELECT * FROM payments_provider_accounts ORDER BY created_at')
  return {
    providers: [...known].map(([id, p]) => ({ id, capabilities: p.capabilities, methods: p.methods, pairsReaders: !!p.pairReader })),
    accounts: await Promise.all(rows.map(async (r) => {
      const keys = known.has(r.provider) ? await credentialStatus(known.get(r.provider)!.secrets, r.id) : []
      return {
        id: r.id, provider: r.provider, label: r.label, channels: JSON.parse(r.channels) as string[], mode: r.mode, externalRef: r.external_ref, active: r.active === 1,
        keys: keys.map(({ name, source, hint }) => ({ name, source, hint })),
        missingKeys: keys.filter(k => !k.source).map(k => k.name),
      }
    })),
  }
})
