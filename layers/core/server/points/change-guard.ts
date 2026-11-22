// Contract for core.change-guard: whether a module can live with a proposed change. A refusal says
// why. Where one answer settles it, the refusal carries the module's question: the window making the
// change asks it and posts the answer to the module's own route, so core never stores the decision
// (Matt, 21 Nov 2026). Core runs every guard and stops on the first refusal.
import type { Actor } from '#kit'
import type { ProposedChange } from './change-impact'

/** One question whose answer lets the change through: posted as `{ [field]: value }` to `post`. */
export interface GuardQuestion { label: string, field: string, post: string, options: { value: string, label: string, description?: string }[] }
export type GuardAnswer = { allowed: true } | { allowed: false, code: string, reason: string, link?: string, question?: GuardQuestion }

export interface ChangeGuard {
  check: (change: ProposedChange, actor: Actor) => Promise<GuardAnswer>
}
