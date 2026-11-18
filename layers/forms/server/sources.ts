// The sources a "record from a source" question may choose from (forms.source): those contributed
// by the modules switched on now. An answer is the chosen records' ids; the server checks each is a
// record of the source and keeps its label as it read when the response was sent.
import { refuse, usePoint } from '#kit'
import type { Answers, Definition, Entry, Value } from '../shared/engine'
import { questionsOf } from '../shared/engine'
import type { FormsSource } from './points/source'

export async function sources(): Promise<FormsSource[]> {
  return (await usePoint<FormsSource>('forms.source')).map(c => c.value).filter(s => !!s?.key)
}
export const sourceOf = async (key: string | undefined): Promise<FormsSource | undefined> => (await sources()).find(s => s.key === key)

const chosen = (value: unknown): string[] => typeof value === 'string' && value ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

/**
 * The labels of every record chosen in these answers, by question and id. An id its source does
 * not know is refused, with the path of the answer; so is an answer to a question whose source is
 * not here now (its module is switched off).
 */
export async function recordLabels(def: Definition, kept: Answers): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>()
  const fields: Record<string, string> = {}
  for (const { question: q, group } of questionsOf(def)) {
    if (q.type !== 'record') continue
    const found: { path: string, ids: string[] }[] = group
      ? (Array.isArray(kept[group.id]) ? kept[group.id] as Entry[] : []).map((entry, i) => ({ path: `${group.id}.${i}.${q.id}`, ids: chosen(entry[q.id] as Value) }))
      : [{ path: q.id, ids: chosen(kept[q.id]) }]
    const ids = [...new Set(found.flatMap(f => f.ids))]
    if (!ids.length) continue
    const source = await sourceOf(q.source)
    const labels = source ? await source.labels(ids) : {}
    for (const f of found) if (f.ids.some(id => labels[id] === undefined)) fields[f.path] = 'forms.issues.record'
    out.set(q.id, labels)
  }
  if (Object.keys(fields).length) refuse('forms.response.invalid', 'Some answers need attention.', { status: 422, fields }) // not-policy: HTTP status
  return out
}
