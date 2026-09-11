// The show screen's sections (D-132 criterion 1). The tab lives in the URL, so a link to one
// section is a link, and a tab nobody has heard of falls back to the first.

export interface ShowTab {
  value: string
  label: string
  icon: string
}

export const SHOW_TABS: ShowTab[] = [
  { value: 'details', label: 'Details', icon: 'i-lucide-file-text' },
  { value: 'performances', label: 'Performances', icon: 'i-lucide-calendar-days' },
  { value: 'ticket-types', label: 'Ticket types', icon: 'i-lucide-ticket' },
  { value: 'warnings', label: 'Content warnings', icon: 'i-lucide-triangle-alert' },
  { value: 'sales', label: 'Sales', icon: 'i-lucide-chart-no-axes-column' },
]

export function showTab(value: unknown): string {
  return SHOW_TABS.some(tab => tab.value === value) ? String(value) : SHOW_TABS[0]!.value
}
