// People, for a "record from a source" question: found as core's person picker finds them, and
// only by somebody who may search people there. Core contributes to no module's point, so forms
// declares the sources for core's records itself.
import { all, can } from '#kit'
import { searchAccounts } from '#modules/core'
import type { FormsSource } from '../../points/source'

export default {
  key: 'core.person',
  label: 'forms.sources.core.person',
  people: true,
  allowed: async actor => (await can(actor, 'core.account.search')).allowed,
  search: async text => (await searchAccounts(text)).filter(p => !p.disabled).map(p => ({ id: p.id, label: p.label })),
  async labels(ids) {
    const rows = await all<{ id: string, label: string | null }>('SELECT id, name AS label FROM core_accounts WHERE id IN (SELECT value FROM json_each(?)) AND anonymised_at IS NULL', JSON.stringify(ids))
    return Object.fromEntries(rows.map(r => [r.id, r.label ?? 'Unnamed person']))
  },
} satisfies FormsSource
