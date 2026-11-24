// A fixture fact on a record: the person performs in this performance, from a fixed list.
import { defineFact } from '#kit'

/** Performance id to the accounts performing in it. */
export const performers = new Map<string, Set<string>>()

export default defineFact(
  (actor, record) => !!actor.accountId && !!record && !!performers.get(record.id)?.has(actor.accountId),
  { holders: async record => record ? [...performers.get(record.id) ?? []] : [...new Set([...performers.values()].flatMap(s => [...s]))] },
)
