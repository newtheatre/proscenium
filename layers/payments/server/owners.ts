// The owners' records behind parts of payments, as money screens name them: an order's reference and
// buyer, linked to it. Each owner describes its own records through payments.settlement; a module
// that does not is named alone.
import { all } from '#kit'
import type { OwnerRecord } from './points/settlement'
import { settlements } from './settlements'

export interface OwnerRef { module: string, record: string }
export type DescribedOwner = OwnerRef & Partial<OwnerRecord>

/** Each owner record described once, keyed `module:record`. One that cannot be described keeps its ids. */
export async function describeOwners(refs: readonly OwnerRef[]): Promise<Map<string, DescribedOwner>> {
  const handlers = await settlements()
  const out = new Map<string, DescribedOwner>()
  for (const ref of refs) {
    const key = `${ref.module}:${ref.record}`
    if (out.has(key)) continue
    const found = await Promise.resolve(handlers.get(ref.module)?.describe?.(ref.record)).catch(() => null)
    out.set(key, { ...ref, ...(found ?? {}) })
  }
  return out
}

/** What a payment was for, as a record title and address: its owners' references, or nothing known. */
export async function intentTitle(intentId: string, prefix: string): Promise<{ title: string, to?: string } | null> {
  const parts = await all<{ owner_module: string, owner_record: string }>('SELECT owner_module, owner_record FROM payments_intent_parts WHERE intent_id = ? ORDER BY id', intentId)
  if (!parts.length) return null
  const owners = [...(await describeOwners(parts.map(p => ({ module: p.owner_module, record: p.owner_record })))).values()]
  const references = owners.flatMap(o => o.reference ?? [])
  return { title: references.length ? `${prefix} ${references.join(', ')}` : prefix, to: owners.find(o => o.to)?.to }
}
