import { useRegistry } from '#kit/registry'
import { kitGrantsOf } from './grants'

// Whether this person holds any privileged ability, so the console will want a passkey (ID-03).
export async function holdsPrivileged(accountId: string): Promise<boolean> {
  const registry = useRegistry()
  return (await kitGrantsOf(accountId)).some(g => g.ability && registry.abilities.get(g.ability)?.decl.risk === 'privileged')
}
