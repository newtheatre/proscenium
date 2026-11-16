// Contract for core.export-contributor (identity spec part 4): material for a person's data download
// that the data-class registry cannot find, such as files, rows matched by an address digest, or
// special category data opened for its owner. Each part becomes one file in the download, under the
// contributing module's folder, listed in its index with `title`.
export interface ExportPart {
  /** The file's name inside the module's folder: lower case, no slashes at the start. */
  path: string
  /** What the file holds, in the person's own terms, for the index. */
  title: string
  bytes: Uint8Array | string
}

export interface ExportContributor {
  export: (subject: { accountId: string, emails: string[] }) => Promise<ExportPart[]>
}
