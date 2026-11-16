// The guard for addresses under a shell's prefix (UI-07, UI-08). One rule, in this order:
// a signed-out visitor is sent to sign in and back; a signed-in person with no business in the
// shell is told the page does not exist; someone in the shell who lacks this screen's ability is
// told why and what would let them through. A hidden link is tidiness; this is enforcement.
import type { Actor } from '#kit'
import { resolveEntry, shellOf, SHELL_PREFIXES } from '../../shared/navigation'
import { declaredEntries, mayOpen } from './navigation'
import { isEntitled, isSignedIn } from './viewer'

export type AccessDecision
  = | { decision: 'allow' }
    | { decision: 'sign-in' }
    | { decision: 'not-found' }
    | { decision: 'refused', refusal: { code: string, reason: string, remedy?: string } }

export async function decideAccess(actor: Actor, path: string): Promise<AccessDecision> {
  const shell = shellOf(path)
  if (!shell) return { decision: 'allow' }
  const clean = (path.split(/[?#]/)[0] ?? '').replace(/(?<=.)\/$/, '')
  const isHome = clean === SHELL_PREFIXES[shell]
  if (isHome) {
    // A shell's home belongs to the shell: whoever is entitled to it may open it.
    if (!isSignedIn(actor)) return { decision: 'sign-in' }
    return (await isEntitled(actor, shell)) ? { decision: 'allow' } : { decision: 'not-found' }
  }
  const entries = (await declaredEntries()).filter(e => e.shell === shell)
  const entry = resolveEntry(entries, path)
  if (!entry) return { decision: 'not-found' }
  if (!isSignedIn(actor)) return { decision: 'sign-in' }
  if (!(await isEntitled(actor, shell))) return { decision: 'not-found' }
  const result = await mayOpen(actor, entry)
  if (result.allowed) return { decision: 'allow' }
  return { decision: 'refused', refusal: { code: result.code, reason: result.reason, remedy: result.remedy } }
}
