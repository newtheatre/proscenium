// Contract for core.credential-use: which of a module's per-record credentials (declared with no
// `manage`) a record in use still lacks, so its "Set up" card asks only for those.
export interface CredentialUse {
  missing: () => Promise<string[]>
}
