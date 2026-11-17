// Who is looking, as the shells need to know it. The members' side is identity's to decide
// (isMember, from the fact core.member and the members' area setting); identity's describeViewer
// gives the whole answer, in this shape, so no component ever tests a role or an ability: it
// draws from the name, the sides that are open and the entries the viewer may open.
import { useSetting } from '#kit'
import type { Actor } from '#kit'
import type { NavItem, ShellName } from '../../shared/navigation'
import { allowedEntries, declaredEntries, holds, mayOpen } from './navigation'
import { abilityList, entryLabelKey } from '../../shared/navigation'
import { isMember } from '../identity/standings'

export type Side = 'audience' | 'members' | 'console' | 'admin' | 'live'

export interface ViewerDescription {
  signedIn: boolean
  name?: string
  /** What the theatre calls the members' area (core.members-area.name). */
  membersName?: string
  sides: Side[]
  navigation: (NavItem & { shell: ShellName })[]
}

export function isSignedIn(actor: Actor): boolean {
  return actor.kind === 'person' || actor.kind === 'setup'
}

export { isMember }

/** Console: holding any ability a console entry names. */
export async function holdsConsole(actor: Actor): Promise<boolean> {
  for (const entry of await declaredEntries()) {
    // An entry that names no ability grants no entitlement: it is open to whoever is in the shell.
    if (entry.menu === 'console' && abilityList(entry.ability).length && holds(await mayOpen(actor, entry))) return true
  }
  return false
}

/**
 * Whether the actor may open Site administration (R-33): it has no ability of its own, so a person
 * sees it when they hold the ability of at least one admin entry.
 */
export async function holdsAdmin(actor: Actor): Promise<boolean> {
  for (const entry of await declaredEntries()) {
    if (entry.menu === 'admin' && abilityList(entry.ability).length && holds(await mayOpen(actor, entry))) return true
  }
  return false
}

/**
 * Live mode: holding the ability of at least one live entry (a tile on the Tonight hub). Like site
 * administration it has no ability of its own; the modules that bring live screens decide who works
 * tonight through their entries' abilities, which may be held through a fact such as being on shift.
 */
export async function holdsLive(actor: Actor): Promise<boolean> {
  for (const entry of await declaredEntries()) {
    if (entry.menu === 'live' && abilityList(entry.ability).length && holds(await mayOpen(actor, entry))) return true
  }
  return false
}

export async function isEntitled(actor: Actor, shell: ShellName): Promise<boolean> {
  if (!isSignedIn(actor)) return false
  if (shell === 'account') return true
  if (shell === 'members') return isMember(actor)
  if (shell === 'console') return holdsConsole(actor)
  if (shell === 'admin') return holdsAdmin(actor)
  return holdsLive(actor)
}

/** Identity's describeViewer (part 4, "Services"): the name, the sides open and the entries the viewer may open. */
export async function describeViewer(actor: Actor): Promise<ViewerDescription> {
  if (!isSignedIn(actor)) return { signedIn: false, sides: ['audience'], navigation: [] }
  const sides: Side[] = ['audience']
  if (await isMember(actor)) sides.push('members')
  if (await holdsConsole(actor)) sides.push('console')
  if (await holdsAdmin(actor)) sides.push('admin')
  if (await holdsLive(actor)) sides.push('live')
  const navigation: ViewerDescription['navigation'] = []
  for (const shell of ['account', 'members'] as const) {
    if (shell === 'members' && !sides.includes('members')) continue
    for (const e of await allowedEntries(actor, shell)) {
      navigation.push({ id: e.id, shell, label: e.label ?? entryLabelKey(e.id), to: e.to, icon: e.icon, match: e.match, count: e.countValue, order: e.order ?? 0 })
    }
  }
  const membersName = sides.includes('members') ? await useSetting('core.members-area.name') as string : undefined
  return { signedIn: true, name: actor.name, membersName, sides, navigation: navigation.sort((a, b) => a.order - b.order) }
}
