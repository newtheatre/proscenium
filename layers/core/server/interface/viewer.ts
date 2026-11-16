// Who is looking, as the shells need to know it. Identity's `describeViewer` replaces `describe`
// below; the answer keeps this shape so no component ever tests a role or an ability: it draws from
// the name, the sides that are open and the entries the viewer may open.
import { fact } from '#kit'
import { useRegistry } from '#kit/registry'
import type { Actor } from '#kit'
import type { NavItem, ShellName } from '../../shared/navigation'
import { allowedEntries, declaredEntries, holds, mayOpen } from './navigation'
import { abilityList, entryLabelKey } from '../../shared/navigation'

export type Side = 'audience' | 'members' | 'console'

export interface ViewerDescription {
  signedIn: boolean
  name?: string
  sides: Side[]
  navigation: (NavItem & { shell: ShellName })[]
}

export function isSignedIn(actor: Actor): boolean {
  return actor.kind === 'person' || actor.kind === 'setup'
}

/** Members' area: the site-wide fact core.member, once identity declares it. Until then nobody is a member. */
export async function isMember(actor: Actor): Promise<boolean> {
  if (!useRegistry().facts.has('core.member')) return false
  return fact('core.member', actor)
}

/** Console: holding any ability a console entry names. */
export async function holdsConsole(actor: Actor): Promise<boolean> {
  for (const entry of await declaredEntries()) {
    // An entry that names no ability grants no entitlement: it is open to whoever is in the shell.
    if (entry.shell === 'console' && abilityList(entry.ability).length && holds(await mayOpen(actor, entry))) return true
  }
  return false
}

export async function isEntitled(actor: Actor, shell: ShellName): Promise<boolean> {
  if (!isSignedIn(actor)) return false
  if (shell === 'account') return true
  if (shell === 'members') return isMember(actor)
  if (shell === 'console') return holdsConsole(actor)
  return false // live mode is entered from the Tonight hub, which the front-of-house module brings
}

export async function describe(actor: Actor): Promise<ViewerDescription> {
  if (!isSignedIn(actor)) return { signedIn: false, sides: ['audience'], navigation: [] }
  const sides: Side[] = ['audience']
  if (await isMember(actor)) sides.push('members')
  if (await holdsConsole(actor)) sides.push('console')
  const navigation: ViewerDescription['navigation'] = []
  for (const shell of ['account', 'members'] as const) {
    if (shell === 'members' && !sides.includes('members')) continue
    for (const e of await allowedEntries(actor, shell)) {
      navigation.push({ id: e.id, shell, label: e.label ?? entryLabelKey(e.id), to: e.to, icon: e.icon, match: e.match, count: e.count, order: e.order ?? 0 })
    }
  }
  return { signedIn: true, name: actor.name, sides, navigation: navigation.sort((a, b) => a.order - b.order) }
}
