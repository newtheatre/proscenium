// Practice mode's seam in the kit (Practice mode, part 3): a request marked as practice runs with the
// person's practice store as its bindings, and nothing it does leaves. Core installs the gate that
// decides (M1 to M4); with none installed a marked request is refused, so the kit fails closed.
import type { H3Event } from 'h3'
import type { Actor, KitEnv } from '../context'
import { currentContext } from '../context-store'
import { Refusal } from '../refusal'

/** The mark a practice tab sends with every request (M1, M5). */
export const PRACTICE_HEADER = 'proscenium-practice'

/** The practice session a request, job or listener runs in. */
export interface PracticeSession {
  accountId: string
  scenarioId: string
  /** The abilities the person holds inside the store (M6). */
  abilities: readonly string[]
  /** The latest the session can last, in UTC milliseconds: cache keys expire by then. */
  endsBy: number
}

export interface PracticeEntry { env: KitEnv, actor: Actor, practice: PracticeSession }

export interface PracticeGate {
  /** A marked request, with its actor read from the real database: the store's bindings and actor, or a refusal. */
  enter: (event: H3Event, actor: Actor) => Promise<PracticeEntry>
  /** An unmarked request: refuses a change sent from a practice page (M2). */
  unmarked: (event: H3Event) => void | Promise<void>
  /** After a marked change commits, inside the store: ticks the scenario's tasks (T1). */
  changed?: () => Promise<void>
}

const closed: PracticeGate = {
  enter: async () => {
    throw new Refusal('core.practice.not-allowed', 'Practice is not available here.', { status: 403 })
  },
  unmarked: () => {},
}
let gate: PracticeGate = closed

/** Core installs its gate here; passing nothing restores the closed one. */
export function setPracticeGate(next: PracticeGate | undefined): void {
  gate = next ?? closed
}

export function usePracticeGate(): PracticeGate {
  return gate
}

/** True inside a practice store. For wording and print only: logic never branches on it. */
export function isPractice(): boolean {
  return !!currentContext()?.practice
}

export function practiceSession(): PracticeSession | undefined {
  return currentContext()?.practice
}

/** A realtime room or held code inside the session, so only that session's screens hear it (O5). */
export function practiceName(name: string): string {
  const practice = practiceSession()
  return practice ? `practice:${practice.accountId}:${name}` : name
}

let guarded = false

/**
 * Makes every server fetch made inside a practice store throw (O2): webhooks, sign-in providers,
 * the challenge and anything a theatre's own module adds. Installed once, at Worker start.
 */
export function guardOutsideCalls(): void {
  if (guarded) return
  guarded = true
  const real = globalThis.fetch
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    if (isPractice()) return Promise.reject(new Refusal('core.practice.no-outside-calls', 'Nothing leaves practice.', { status: 409 }))
    return real(...args)
  }) as typeof fetch
}
