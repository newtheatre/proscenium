// Contract for core.count: a number shown beside a menu entry, an account section or a home card.
// It counts for the person asking, and a count that is slow or fails is treated as zero by its caller.
import type { Actor } from '#kit'

export interface Count {
  value: (actor: Actor) => Promise<number>
}
