// Link tokens (Foundations part 4, "Link tokens", T1 to T5): the secret in an address that opens one
// thing, such as a ticket or a booking, without signing in. The kit makes 32 random bytes, hands
// the token out once and keeps only its keyed hash, the way identity keeps its sign-in links. The
// raw token is never stored, logged, sealed, or put in an event, a job's payload or an audit row:
// the module stores the hash and an expiry on the row the link opens, and passes the token straight
// to the notification that carries the link, as a sealed variable.
import { digest, randomToken } from '../server/identity/crypto'
import { currentContext } from './context-store'

const PURPOSE = 'link-token'

export const linkTokens = {
  /** A new token, to send once, and the hash to store in its place. */
  async issue(): Promise<{ token: string, hash: string }> {
    const token = randomToken()
    return { token, hash: await digest(PURPOSE, token) }
  },
  /** The hash of a token someone presented, to look up the row it opens. */
  hash(presented: string): Promise<string> {
    return digest(PURPOSE, presented)
  },
}

/**
 * The tokens this request carries in path parameters its route declares as tokens. The kit keeps
 * them out of the log, error reports, audit rows, events and job payloads.
 */
export function requestTokens(): readonly string[] {
  return currentContext()?.tokens ?? []
}

/** The text with every token of this request replaced. */
export function withoutTokens(text: string): string {
  let out = text
  for (const token of requestTokens()) out = out.split(token).join('[token]')
  return out
}

/** Refuses a value that holds a token of this request, at any depth. */
export function refuseTokens(value: unknown, where: string): void {
  const tokens = requestTokens()
  if (!tokens.length) return
  const visit = (v: unknown, depth: number): void => {
    if (typeof v === 'string') {
      if (tokens.some(t => v.includes(t))) throw new Error(`${where} holds the link token from the address; store and pass its hash (linkTokens.hash), never the token`)
    }
    else if (v && typeof v === 'object' && depth < 8) for (const x of Object.values(v)) visit(x, depth + 1) // not-policy: how deep a payload is searched
  }
  visit(value, 0)
}
