// The last-IT-Manager guard (A-120). A grant that runs out is not an act, so no guard sees it: the
// IT Manager the system keeps is a usable one whose grant cannot lapse (criterion 1, 0009).

export interface ProtectedHolder {
  userId: string
  expiresAt: number | null
}

// Nobody usable would be left, or nobody whose grant cannot lapse.
export type Stranding = 'last' | 'dated'

export type StrandingAct = 'revoking' | 'disabling' | 'erasing' | 'merging'

// What taking one account's IT Manager standing away would leave, read from the usable holders.
export function strandingBy(holders: readonly ProtectedHolder[], userId: string): Stranding | null {
  const others = holders.filter(holder => holder.userId !== userId)
  if (others.length === 0) return 'last'
  if (others.length === holders.length) return null
  return others.some(holder => holder.expiresAt === null) ? null : 'dated'
}

// The write refused what the read had allowed: another officer changed the IT Managers between.
export const IT_MANAGERS_CHANGED = 'The IT Managers changed while this was being done. Look again, then try once more.'

export function strandingRefusal(stranding: Stranding, act: StrandingAct): string {
  const doing = act === 'merging' ? 'merging this one away' : `${act} this one`
  return stranding === 'last'
    ? `That is the last IT Manager: grant another before ${doing}`
    : `No other IT Manager grant is permanent: make one permanent before ${doing}`
}

export interface ProtectedGrant {
  // Null for an account the grant itself creates.
  userId: string | null
  expiresAt: number | null
  // Enabled, not erased and signed into: a grant on anybody else keeps nothing (A-120 criterion 3).
  usable: boolean
}

// A grant of the IT Manager role is refused unless, once made, a usable IT Manager holds one that
// cannot lapse; the refusal names the way out.
export function protectedGrantRefusal(holders: readonly ProtectedHolder[], grant: ProtectedGrant): string | null {
  if (holders.some(holder => holder.userId !== grant.userId && holder.expiresAt === null)) return null
  if (grant.usable && grant.expiresAt === null) return null
  return grant.usable
    ? 'No other IT Manager grant is permanent, so this one must be: choose Further notice'
    : 'No IT Manager grant is permanent yet: make one permanent before granting another'
}
