// A report's own words: a catalogue key for a ready-made report, the maker's text for a saved one;
// and a breakdown key's name, which Reports gives the shared keys and a module its own.
import type { ReportView, Words } from '../../shared/reports'

export function useReportWords() {
  const { t } = useT()
  const words = (w: Words | null | undefined) => !w ? '' : 'key' in w ? t(w.key) : w.text
  const keyName = (key: string, labels: ReportView['keyLabels'] = {}) => t(labels[key] ?? `reports.by.${key}`)
  return { words, keyName }
}
