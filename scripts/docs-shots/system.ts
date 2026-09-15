import { CONSOLE_WIDTH } from './types'
import type { Shot } from './types'

const admin = 'dev-admin@e2e.newtheatre.org.uk'

export const system: Shot[] = [
  {
    name: 'system/overview',
    persona: admin,
    url: '/admin',
    marker: '[data-test="delivery-trouble"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="docs-link"]', label: 'Help for this screen' },
      { selector: '[data-test="delivery-trouble"]', label: 'Messages that did not arrive' },
    ],
  },
  {
    name: 'system/settings',
    persona: admin,
    url: '/admin/settings',
    marker: '[data-test="setting-HOLD_RELEASE_MINUTES_BEFORE"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="config-search"]', label: 'Search' },
      { selector: '[data-test="setting-HOLD_RELEASE_MINUTES_BEFORE"]', label: 'A setting' },
      { selector: '[data-test="input-HOLD_RELEASE_MINUTES_BEFORE"]', label: 'The input' },
      { selector: '[data-test="save-HOLD_RELEASE_MINUTES_BEFORE"]', label: 'Save' },
    ],
  },
  {
    name: 'system/audit',
    persona: admin,
    url: '/admin/audit',
    marker: '[data-test="audit-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters' },
      { selector: '[data-test="audit-record"]', label: 'Record something' },
      { selector: '[data-test="audit-export"]', label: 'Export' },
      { selector: '[data-test="audit-table"]', label: 'The entries' },
    ],
  },
  {
    name: 'system/backups',
    persona: admin,
    url: '/admin/backups',
    marker: '[data-test="drills-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      // The seed records no drill and the interval ships set, so the card is the overdue notice.
      { selector: '[data-test="drill-overdue"], [data-test="drill-current"]', label: 'The drill card' },
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="record-drill"]', label: 'Record a drill' },
      { selector: '[data-test="drills-table"]', label: 'The drill log' },
    ],
  },
  {
    name: 'system/docs',
    persona: 'dev-member@e2e.newtheatre.org.uk',
    url: '/docs',
    marker: '[data-test="docs-body"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="docs-nav"]', label: 'The sidebar' },
      { selector: '[data-test="docs-search"]', label: 'Search' },
      { selector: '[data-test="report-drift"]', label: 'Report as out of date' },
    ],
  },
]
