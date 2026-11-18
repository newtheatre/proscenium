// Names for where postings came from, so the ledger shows "Payment for Order K7Q2XD" rather than a
// record id. Each module resolves its own records through core.record-resolver; a posting's source
// type is tried as given, then under its module's name, then as a core record (a performance).
import { usePoint } from '#kit'
import { getPerformance } from '#modules/core'

interface Resolver { resolve: (id: string) => Promise<{ title: string, to?: string } | null> }
export interface SourceRef { module: string, type: string, id: string }

/** Each source's title and address, keyed `type:id`; one no module resolves is left out. */
export async function sourceRecords(refs: readonly SourceRef[]): Promise<Map<string, { title: string, to?: string }>> {
  const resolvers = new Map((await usePoint<Resolver>('core.record-resolver')).map(c => [c.id, c.value]))
  const out = new Map<string, { title: string, to?: string }>()
  for (const ref of refs) {
    const key = `${ref.type}:${ref.id}`
    if (out.has(key)) continue
    const resolver = resolvers.get(ref.type) ?? resolvers.get(`${ref.module}.${ref.type}`) ?? resolvers.get(`core.${ref.type}`)
    if (!resolver) continue
    try {
      const found = await resolver.resolve(ref.id)
      if (found) out.set(key, { title: found.title, ...(found.to ? { to: found.to } : {}) })
    }
    catch {
      // A source that no longer resolves keeps its id on screen.
    }
  }
  return out
}

/** Each performance's production title and start, keyed by id. */
export async function performanceNames(ids: readonly string[]): Promise<Map<string, { title: string, startsAt: number }>> {
  const out = new Map<string, { title: string, startsAt: number }>()
  for (const id of new Set(ids)) {
    try {
      const p = await getPerformance(id)
      out.set(id, { title: p.label ? `${p.productionTitle}, ${p.label}` : p.productionTitle, startsAt: p.startsAt })
    }
    catch {
      // A performance that is gone keeps its id.
    }
  }
  return out
}
