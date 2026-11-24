// The Modules screen's view of one module, as GET /api/core/modules answers it.
export interface ModuleView {
  id: string
  owner: 'upstream' | 'site' | 'fixtures'
  since: string
  stability: 'experimental' | 'stable' | 'deprecated'
  alwaysOn: boolean
  /** A support module: no switch, on while a module that is on requires it. */
  support: boolean
  on: boolean
  requires: string[]
  uses: string[]
  /** Optional partners: modules that add to this one's points. */
  worksWith?: string[]
  /** Every module that requires this one, on or off. */
  requiredBy: string[]
  /** What switching this one on would also switch on, those required first. */
  alsoOn: string[]
  secrets: { name: string, needed: 'always' | 'when-used' | 'optional', set: boolean }[]
  /** `step` is the "Set up" card's line: null when it asks nothing, else whether it is done. */
  credentials: { name: string, needed: 'always' | 'when-used' | 'optional', set: boolean, step: boolean | null }[]
  /** The `always` secrets not set: they block switching it on. */
  missingSecrets: string[]
  screens: { id: string, menu: string }[]
  changedAt: number | null
  icon: string
  /** How many of its settings are on its page in Admin. */
  settings: number
  /** The first tab of its page this viewer may open, or null. */
  open: string | null
}

/** One tab of a module's page in Admin, as GET /api/core/modules/:id/tabs answers it. */
export interface ModuleTabView {
  id: string
  label: string
  to: string
  icon: string
  /** A generated page of settings: its id. */
  page: string | null
}
