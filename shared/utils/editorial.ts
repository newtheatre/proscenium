// Editorial pages the committee has not written yet (D-103). The flag lives in the page's front
// matter, so what counts as unwritten is one answer for the whole site.

// A page still flagged `placeholder` keeps its address, so an editor can preview it, and is
// linked from nowhere until the copy lands (D-103 criterion 6).
export function withoutPlaceholders<Entry extends { to: string }>(entries: Entry[], placeholders: string[]): Entry[] {
  const unwritten = new Set(placeholders)
  return entries.filter(entry => !unwritten.has(entry.to))
}
