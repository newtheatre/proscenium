// The console's shared component conventions (0032). One spelling of the cancel word, so the
// modal-conventions job that unifies it changes one string rather than every confirmation.
export const CONFIRM_BACK_LABEL = 'Back'

export interface StatusWords { yes: string, no: string }

// A true-or-false table cell (K-135): the icon is what a sighted reader scans, and the words go
// with it so a screen reader, or a phone without the column header, is never left with a shape.
export function statusCell(value: boolean, words: StatusWords): { icon: string, label: string, tone: string } {
  return value
    ? { icon: 'i-lucide-check', label: words.yes, tone: 'text-success' }
    : { icon: 'i-lucide-x', label: words.no, tone: 'text-muted' }
}
