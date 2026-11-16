// Contract for core.change-guard: whether a module can live with a proposed change. A refusal says
// why and may link to the module's own screen where the matter is settled; core never collects the
// module's decision itself. Core runs every guard and stops on the first refusal.
import type { Actor } from '#kit'
import type { ProposedChange } from './change-impact'

export type GuardAnswer = { allowed: true } | { allowed: false, code: string, reason: string, link?: string }

export interface ChangeGuard {
  check: (change: ProposedChange, actor: Actor) => Promise<GuardAnswer>
}
