// Finding things by their words (UI-09, UI-15). Pure, so the palette, the settings search and the
// tests share one rule: every word typed must appear in the label or the help text.

export interface SettingRef {
  key: string
  module: string
  /** The address of the setting's page or bespoke screen, as the settings index gives it. */
  to: string
  section: string
  labelKey: string
  helpKey: string
}

export interface SettingHit extends SettingRef {
  label: string
  help: string
  to: string
}

const words = (term: string) => term.toLowerCase().split(/\s+/).filter(Boolean)

/** Settings whose label or help text holds every word of `term`, label matches first. */
export function matchSettings(index: readonly SettingRef[], term: string, t: (key: string) => string): SettingHit[] {
  const wanted = words(term)
  if (!wanted.length) return []
  const hits: (SettingHit & { rank: number })[] = []
  for (const ref of index) {
    const label = t(ref.labelKey)
    const help = t(ref.helpKey)
    const inLabel = label.toLowerCase()
    const both = `${inLabel} ${help.toLowerCase()} ${ref.key.toLowerCase()}`
    if (!wanted.every(w => both.includes(w))) continue
    hits.push({ ...ref, label, help, to: `${ref.to}${ref.to.includes('?') ? '&' : '?'}setting=${encodeURIComponent(ref.key)}`, rank: wanted.every(w => inLabel.includes(w)) ? 0 : 1 })
  }
  return hits.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label)).map(({ rank: _rank, ...hit }) => hit)
}
