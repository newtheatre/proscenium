// The guard for addresses under a shell's prefix (UI-07, UI-08). One rule, in this order:
// a signed-out visitor is sent to sign in and back; a signed-in person with no business in the
// shell is told the page does not exist; someone in the shell who lacks this screen's ability is
// told why and what would let them through. A hidden link is tidiness; this is enforcement.
import type { Actor } from '#kit'
import { moduleTabOf, resolveEntry, shellOf, SHELL_PREFIXES } from '../../shared/navigation'
import { declaredEntries, holds, mayOpen } from './navigation'
import { isEntitled, isSignedIn } from './viewer'

export type AccessDecision
  = | { decision: 'allow' }
    | { decision: 'sign-in' }
    | { decision: 'not-found' }
    | { decision: 'redirect', to: string }
    | { decision: 'refused', refusal: { code: string, reason: string, remedy?: string } }

/**
 * Someone whose only work is in live mode, such as a steward who may only admit, who comes to the
 * console is sent to the Tonight hub rather than told it does not exist (D6, box office review).
 */
async function toTonight(actor: Actor, shell: string): Promise<AccessDecision | null> {
  return shell === 'console' && (await isEntitled(actor, 'live')) ? { decision: 'redirect', to: SHELL_PREFIXES.live } : null
}

export async function decideAccess(actor: Actor, path: string): Promise<AccessDecision> {
  const shell = shellOf(path)
  if (!shell) return { decision: 'allow' }
  const clean = (path.split(/[?#]/)[0] ?? '').replace(/(?<=.)\/$/, '')
  const isHome = clean === SHELL_PREFIXES[shell]
  if (isHome) {
    // A shell's home belongs to the shell: whoever is entitled to it may open it.
    if (!isSignedIn(actor)) return { decision: 'sign-in' }
    if (await isEntitled(actor, shell)) return { decision: 'allow' }
    return (await toTonight(actor, shell)) ?? { decision: 'not-found' }
  }
  const entries = (await declaredEntries()).filter(e => e.menu === shell)
  const entry = resolveEntry(entries, path)
  if (!entry) return { decision: 'not-found' }
  if (!isSignedIn(actor)) return { decision: 'sign-in' }
  if (!(await isEntitled(actor, shell))) {
    // A tab of a module's page in Admin opens for console staff who may use it in the console's
    // settings window, which draws the same screen; a link or bookmark to it lands there.
    const module = moduleTabOf(entry)
    if (module && holds(await mayOpen(actor, entry)) && (await isEntitled(actor, 'console'))) {
      return { decision: 'redirect', to: `/console?settings=${module}&screen=${encodeURIComponent(path)}` }
    }
    return (await toTonight(actor, shell)) ?? { decision: 'not-found' }
  }
  const result = await mayOpen(actor, entry)
  // A screen opens for anyone who holds its ability, as the menu shows it to them. Confirming it is
  // you (a recent or a stronger sign-in) is asked by the API when the screen loads or does
  // something, where the browser confirms in place; refusing the page here instead turned every
  // reload of such a screen into a dead end, since a server render cannot ask.
  if (result.allowed || holds(result)) return { decision: 'allow' }
  return { decision: 'refused', refusal: { code: result.code, reason: result.reason, remedy: result.remedy } }
}
