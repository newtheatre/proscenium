// What a ::when block, a :fact token and a ::policy-table read, fetched once per page load and shared.
import type { PolicyTable, PolicyValue } from '../../shared/policies'

export interface PolicyPageContext { modules: string[], country: string, facts: Record<string, PolicyValue>, tables: Record<string, PolicyTable> }

export function usePolicyContext() {
  return useAPI<PolicyPageContext>('/api/core/policies/context', { key: 'core:policy-context', default: () => ({ modules: [], country: '', facts: {}, tables: {} }) })
}
