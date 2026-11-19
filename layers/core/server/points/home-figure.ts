// Contract for core.home-figure: a headline figure on the console home's grid (tonight's ticket sales,
// seats taken, bar takings, members), with an optional chart. The home names no module, so a module
// that is off adds no tile, and a figure that is slow or fails is left out rather than breaking the page.
import type { Actor } from '#kit'

/** A label or sentence as a translation key with its values. */
export interface FigureText { key: string, params?: Record<string, string | number> }

export interface FigureChart {
  /** bar, line and area draw over time; meters is a list of rows, each a share of its own `max`. */
  type: 'bar' | 'line' | 'area' | 'meters'
  /** For bar, line and area: each series' key in a row's values and its name as a translation key. */
  series: { key: string, label: string }[]
  /** Oldest first. A row names itself by a calendar `date`, a `month` (2027-09), an instant `at`, or a `label` as shown. */
  rows: { date?: string, month?: string, at?: number, label?: string, values: Record<string, number>, max?: number }[]
  /** One sentence saying what the chart shows, read out in place of it. */
  summary: FigureText
}

export interface FigureAnswer {
  value: number | null
  /** An ISO currency code makes the value money in minor units; 'percent' a whole percentage. */
  unit?: string
  /** A short line under the value: "142 tickets", "of 480 seats". */
  detail?: FigureText
  chart?: FigureChart
}

export interface HomeFigure {
  /** The figure's name, as a translation key. */
  label: string
  /** Who may see it, held anywhere on the site; the home leaves it out for anyone else. */
  ability: string
  /** Its place on the grid, lowest first. */
  order?: number
  /** small takes one cell, wide two side by side, tall two stacked on a laptop. */
  size?: 'small' | 'wide' | 'tall'
  /** Where the figure is looked at more closely. */
  to?: string
  /** Reads the figure for the person asking. Reads only. */
  read: (actor: Actor) => Promise<FigureAnswer>
}
