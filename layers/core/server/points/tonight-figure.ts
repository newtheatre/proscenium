// Contract for core.tonight-figure: a number a module shows beside each of tonight's performances on
// the Tonight hub (D5, box office review): Box office gives sold and in, Payments what the tills
// have taken. The hub names no module, so it works with any of them off.

export interface TonightFigure {
  /** The figure's name, as a translation key. */
  label: string
  /** Who may see it: the hub leaves it out for anyone without this ability on the performance. */
  ability: string
  /** Its place among the performance's figures. */
  order?: number
  /**
   * Reads the figure for one performance. Reads only. An answer that takes too long or throws is
   * shown as unavailable, never as an error on the hub. A unit that is an ISO currency code makes
   * the value money in minor units.
   */
  read: (performanceId: string) => Promise<{ value: string | number | null, state: 'ok' | 'attention' | 'unavailable', unit?: string, to?: string }>
}
