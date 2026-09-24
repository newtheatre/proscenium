// Who an operator page is written for (0093). Public help is its own collection, so only these two
// live in `docs`; the difference between them is navigation, never access.
export const DOCS_AUDIENCES = ['member', 'committee'] as const

export type DocsAudience = (typeof DOCS_AUDIENCES)[number]

interface DocsNavItem {
  path: string
  audience?: unknown
  children?: DocsNavItem[]
}

// A standing permission only ever comes from a grant, but a role may carry none, so both are read.
export function readsCommitteeDocs(viewer: { permissions: readonly string[], holdsRole: boolean }): boolean {
  return viewer.holdsRole || viewer.permissions.length > 0
}

// A section inherits its index page's audience, so it is judged by its pages, never by its own
// field; one whose every page is hidden goes too, rather than sitting as an empty heading.
export function visibleTree<T extends DocsNavItem>(items: readonly T[], committee: boolean): T[] {
  if (committee) return [...items]
  return items.flatMap((item) => {
    if (!item.children) return item.audience === 'committee' ? [] : [item]
    const children = visibleTree(item.children, false)
    return children.length > 0 ? [{ ...item, children }] : []
  })
}

export function committeePaths(items: readonly DocsNavItem[]): Set<string> {
  const found = new Set<string>()
  for (const item of items) {
    if (item.audience === 'committee') found.add(item.path)
    for (const path of committeePaths(item.children ?? [])) found.add(path)
  }
  return found
}
