// The Modules screen's view of one module, as GET /api/core/modules answers it.
export interface ModuleView {
  id: string
  owner: 'upstream' | 'site' | 'fixtures'
  since: string
  stability: 'experimental' | 'stable' | 'deprecated'
  alwaysOn: boolean
  on: boolean
  requires: string[]
  uses: string[]
  /** Every module that requires this one, on or off. */
  requiredBy: string[]
  /** What switching this one on would also switch on, those required first. */
  alsoOn: string[]
  secrets: { name: string, needed: 'always' | 'when-used' | 'optional', set: boolean }[]
  credentials: { name: string, needed: 'always' | 'when-used' | 'optional', set: boolean }[]
  /** The `always` secrets not set: they block switching it on. */
  missingSecrets: string[]
  screens: { id: string, menu: string }[]
  changedAt: number | null
}
