// A reference map points at a row a transform does not create (a room, a union venue), authored
// through its own admin screen rather than migrated. See migration/README.md, "Two kinds of map".
import { join } from 'node:path'
import { OUT } from './lib'

export interface ReferenceMapEntry { key: string, value: string }

// Every old row gets a line, matched or not, so an unresolved one is visible in the file
// itself rather than merely missing from it. `dir` is a seam for tests, never production.
export async function readReferenceLines(name: string, dir = OUT): Promise<ReferenceMapEntry[]> {
  const path = join(dir, name)
  const entries: ReferenceMapEntry[] = []
  if (!await Bun.file(path).exists()) return entries
  for (const line of (await Bun.file(path).text()).split('\n')) {
    if (!line) continue
    const [key, value] = line.split('\t')
    if (key) entries.push({ key, value: value ?? '' })
  }
  return entries
}

export interface ReferenceMap {
  resolved: Map<string, string>
  blanks: string[]
}

// The shape a transform consumes: resolved keys to write with, and the blanks that are the
// whole reason it must refuse to run rather than guess or skip silently.
export async function readReferenceMap(name: string, dir = OUT): Promise<ReferenceMap> {
  const resolved = new Map<string, string>()
  const blanks: string[] = []
  for (const { key, value } of await readReferenceLines(name, dir)) {
    if (value) resolved.set(key, value)
    else blanks.push(key)
  }
  return { resolved, blanks }
}

export interface DraftRow { id: number | string, name: string }
export interface DraftResult { written: number, matched: number, blank: number }

// A row the file has already seen, confirmed or blank, is left untouched; only a new old row
// gets a fresh line. `targetNames` is keyed exactly as the target's own unique index compares.
export async function draftReferenceMap(
  name: string,
  prefix: string,
  oldRows: DraftRow[],
  targetNames: Map<string, string>,
  dir = OUT,
): Promise<DraftResult> {
  const existing = new Map((await readReferenceLines(name, dir)).map(entry => [entry.key, entry.value]))

  let matched = 0
  let blank = 0
  const lines: string[] = []
  for (const row of oldRows) {
    const key = `${prefix}${row.id}`
    if (existing.has(key)) {
      const value = existing.get(key)!
      lines.push(`${key}\t${value}`)
      if (value) matched++
      else blank++
      continue
    }
    const targetId = targetNames.get(row.name) ?? ''
    lines.push(`${key}\t${targetId}`)
    if (targetId) matched++
    else blank++
  }

  await Bun.write(join(dir, name), `${lines.join('\n')}\n`)
  return { written: lines.length, matched, blank }
}
