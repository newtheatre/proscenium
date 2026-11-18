// The card companies this site really uses: those with an active provider account. The policies
// name them (and their cookies) from here, so the privacy notice follows the Providers screen.
import { all } from '#kit'

/** Provider ids that mean the same company. */
const COMPANIES: Record<string, { id: string, name: string }> = {
  'stripe': { id: 'stripe', name: 'Stripe' },
  'sumup': { id: 'sumup', name: 'SumUp' },
  'sumup-handoff': { id: 'sumup', name: 'SumUp' },
}

export async function cardCompanies(): Promise<{ id: string, name: string }[]> {
  const rows = await all<{ provider: string }>('SELECT DISTINCT provider FROM payments_provider_accounts WHERE active = 1 ORDER BY provider')
  const found = new Map<string, { id: string, name: string }>()
  for (const row of rows) {
    const company = COMPANIES[row.provider]
    if (company) found.set(company.id, company)
  }
  return [...found.values()]
}
