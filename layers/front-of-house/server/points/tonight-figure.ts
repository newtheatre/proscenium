// Contract for front-of-house.tonight-figure: a number another module shows on the front of house
// board (Front of house specification, part 5). Box office gives sold, admitted and the rest;
// Payments the till sessions. Front of house calls no other module, so the board works without them.

export interface TonightFigure {
  /** The figure's name, as a translation key. */
  label: string
  /** Who may see it: the board leaves it out for anyone without this ability on the performance. */
  ability: string
  /** Its place on the board. */
  order?: number
  /**
   * Reads the figure for one performance. Reads only. An answer that takes too long or throws is
   * shown as unavailable, never as an error on the board.
   */
  read: (performanceId: string) => Promise<{ value: string | number | null, state: 'ok' | 'attention' | 'unavailable', to?: string }>
}
