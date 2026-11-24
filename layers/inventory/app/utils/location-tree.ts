// The locations tree drawn as a list: each location after its parent, indented by depth, with its
// full path ("Costume store › Rail 3") for pickers.
import type { Location } from '../../shared/setup'

export interface TreeRow { location: Location, depth: number, path: string }

export function locationTree(locations: Location[]): TreeRow[] {
  const children = new Map<string | null, Location[]>()
  for (const l of locations) children.set(l.parentId, [...(children.get(l.parentId) ?? []), l])
  const out: TreeRow[] = []
  const walk = (parentId: string | null, depth: number, above: string) => {
    for (const l of children.get(parentId) ?? []) {
      const path = above ? `${above} › ${l.name}` : l.name
      out.push({ location: l, depth, path })
      walk(l.id, depth + 1, path)
    }
  }
  walk(null, 1, '')
  return out
}

// A location and everything inside it, which it may not be moved into.
export function insideOf(locations: Location[], id: string): Set<string> {
  const found = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const l of locations) {
      if (l.parentId && found.has(l.parentId) && !found.has(l.id)) {
        found.add(l.id)
        grew = true
      }
    }
  }
  return found
}
