import { CONSOLE_WIDTH } from './types'
import type { Shot } from './types'

const persona = 'dev-treasurer@e2e.newtheatre.org.uk'

export const money: Shot[] = [
  {
    name: 'money/dashboard',
    persona,
    url: '/money',
    marker: '[data-test="period-kind"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="period-kind"]', label: 'Period kind' },
      { selector: '[data-test="period-year"]', label: 'Year' },
      { selector: '[data-test="refresh-summary"]', label: 'Refresh' },
      { selector: '[data-test="section-revenue"]', label: 'Revenue by source' },
      { selector: '[data-test="section-figures"]', label: 'Refunds, foregone value and open variance' },
    ],
  },
  {
    name: 'money/revenue-by-show',
    persona,
    url: '/money/shows',
    marker: '[data-test="period-year"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="period-year"]', label: 'Year' },
      { selector: '[data-test="refresh-revenue"]', label: 'Refresh' },
      { selector: '[data-test="show-row"]', label: 'A show\'s row' },
      { selector: '[data-test="section-passes"]', label: 'Pass utilisation' },
    ],
  },
  {
    name: 'money/comps-and-discounts',
    persona,
    url: '/money/reports',
    marker: '[data-test="scope-kind"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="scope-kind"]', label: 'Scope' },
      { selector: '[data-test="scope-from"]', label: 'Date range' },
      { selector: '[data-test="refresh-report"]', label: 'Refresh' },
      { selector: '[data-test="section-foregone"]', label: 'Foregone value' },
      { selector: '[data-test="section-access"]', label: 'Access and companion admissions' },
    ],
  },
  {
    name: 'money/reconciliation',
    persona,
    url: '/money/reconciliation',
    marker: '[data-test="reconciliation-night"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="reconciliation-night"]', label: 'Night' },
      { selector: '[data-test="expected-total"]', label: 'Expected total' },
      { selector: '[data-test="section-current"]', label: 'Current reading' },
      { selector: '[data-test="reader-pence"]', label: 'Reader figure, in pence' },
      { selector: '[data-test="record-reading"]', label: 'Record' },
    ],
  },
  {
    name: 'money/ledger-entries',
    persona,
    url: '/money/entries',
    marker: '[data-test="entries-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="entries-table"]', label: 'Entries' },
      { selector: '[data-test="entries-total"]', label: 'Count' },
    ],
  },
  {
    name: 'money/periods',
    persona,
    url: '/money/periods',
    marker: '[data-test="locks-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="open-close-period"]', label: 'Close a period' },
      { selector: '[data-test="locks-table"]', label: 'Close history' },
    ],
  },
  {
    name: 'money/periods-close',
    persona,
    url: '/money/periods',
    marker: '[data-test="locks-table"]',
    width: CONSOLE_WIDTH,
    after: 'document.querySelector(\'[data-test="open-close-period"]\').click()',
    annotations: [
      { selector: '[data-test="close-from"]', label: 'From' },
      { selector: '[data-test="close-to"]', label: 'To' },
      { selector: '[data-test="close-label"]', label: 'Label' },
      { selector: '[data-test="preview-close"]', label: 'Preview what this warns about' },
    ],
  },
  {
    name: 'money/exports',
    persona,
    url: '/money/exports',
    marker: '[data-test="section-export"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="period-kind"]', label: 'Period' },
      { selector: '[data-test="period-year"]', label: 'Year' },
      { selector: '[data-test="export-csv"]', label: 'Export CSV' },
      { selector: '[data-test="export-status"]', label: 'What the export covers' },
      { selector: '[data-test="mappings-table"]', label: 'Nominal code mappings' },
    ],
  },
]
