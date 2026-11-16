// Three-way merge for a stale save (UI-13): what I started from, what I have now, what is saved.
// A field only one side changed merges on its own; a field both changed is a conflict a person
// settles. Never overwrites silently.

export interface Merge {
  /** Mine where only I changed it, theirs where only they did, theirs where we agree. */
  merged: Record<string, unknown>
  /** Fields both changed to different values: shown side by side. */
  conflicts: string[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function mergeConflict(base: Record<string, unknown>, mine: Record<string, unknown>, theirs: Record<string, unknown>): Merge {
  const merged: Record<string, unknown> = {}
  const conflicts: string[] = []
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const iChanged = !same(base[key], mine[key])
    const theyChanged = !same(base[key], theirs[key])
    if (iChanged && theyChanged && !same(mine[key], theirs[key])) {
      conflicts.push(key)
      merged[key] = mine[key]
    }
    else {
      merged[key] = iChanged ? mine[key] : theirs[key]
    }
  }
  return { merged, conflicts }
}

/** A refusal for a stale save ends in `.conflict`. */
export const isConflict = (code: string | undefined) => !!code && /\.conflict$/.test(code)

/** More than this many fields and a form gets its own page instead of a panel over the list. */
export const PANEL_FIELD_LIMIT = 6 // not-policy: the specification's "about six fields"
