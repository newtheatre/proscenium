// The provider keys an active provider account lacks, so a provider nobody has added is never asked for.
import { all } from '#kit'
import { missingSecrets, providers } from '../../providers'

export default {
  async missing() {
    const known = await providers()
    const accounts = await all<{ id: string, provider: string }>('SELECT id, provider FROM payments_provider_accounts WHERE active = 1')
    const out = new Set<string>()
    for (const account of accounts) {
      const provider = known.get(account.provider)
      if (provider) for (const name of await missingSecrets(provider, account.id)) out.add(name)
    }
    return [...out]
  },
} satisfies { missing: () => Promise<string[]> }
