// A module's own breakdown keys, such as Box office's ticket types (B6, REP-43): the module labels
// the key and lists its values through reports.key, so a page can name a row and offer a filter.
import { usePoint } from '#kit'
import { MODULE_KEY, isPageBreakdown } from '../shared/reports'

export interface ReportKey {
  /** The key's name, as a catalogue key. */
  label: string
  /** Every value the key can take, with its name, for a filter's choices and a row's label. */
  values: () => Promise<{ value: string, label: string }[]>
}

async function keysOf(): Promise<Map<string, ReportKey>> {
  return new Map((await usePoint<ReportKey>('reports.key')).map(k => [k.id, k.value]))
}

/** The catalogue key naming each module key asked about; a shared key is named by Reports itself. */
export async function keyLabels(keys: string[]): Promise<Record<string, string>> {
  const known = await keysOf()
  const out: Record<string, string> = {}
  for (const key of keys) {
    if (isPageBreakdown(key)) continue
    const found = known.get(key)
    if (found) out[key] = found.label
  }
  return out
}

/** Whether a key can be named on a page: a shared one, or a module key with a reports.key entry. */
export async function nameable(key: string): Promise<boolean> {
  return isPageBreakdown(key) || (MODULE_KEY.test(key) && (await keysOf()).has(key))
}

/** A module key's values with their names; empty for a key nobody labels. */
export async function keyValues(key: string): Promise<{ value: string, label: string }[]> {
  return await (await keysOf()).get(key)?.values() ?? []
}
