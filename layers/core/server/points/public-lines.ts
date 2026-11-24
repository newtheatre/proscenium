// Contract for core.public-lines (C-75): short billing lines a module adds to a
// production's public page, drawn as plain text where `placement` says. Public data only.
export interface PublicLine {
  text: string
  placement: 'under-title' | 'credits' | 'footer'
  /** Lowest first within its placement. */
  order?: number
}

export interface ProductionPublicLines {
  read: (productionId: string) => Promise<PublicLine[]>
}
