// Contract for front-of-house.report-section: a module's part of the night report (Front of house
// specification, part 5). Box office gives attendance; Payments takings and reconciliation. Compiled
// when the report is signed off, so the record keeps the figures of that moment.

export interface ReportSection {
  /** The section's heading, as a translation key. */
  label: string
  /** Its place in the report. */
  order?: number
  /** The section's lines for one performance. Reads only. */
  compile: (performanceId: string) => Promise<{ label: string, value: string | number, unit?: string }[]>
}
