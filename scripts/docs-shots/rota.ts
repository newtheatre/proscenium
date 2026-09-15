import { CONSOLE_WIDTH } from './types'
import type { Shot } from './types'

const foh = 'dev-foh@e2e.newtheatre.org.uk'
// The shift eligibility card needs config.read, and Safety has no seeded SAFETY_OFFICER persona.
const admin = 'dev-admin@e2e.newtheatre.org.uk'

// The runner waits after this, so a click is enough to have the dialog open for the capture.
const openFirst = (selector: string): string => `document.querySelector('${selector}').click()`

export const rota: Shot[] = [
  {
    name: 'rota/templates',
    persona: admin,
    url: '/rota/manage/templates',
    marker: '[data-test="templates-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="shift-eligibility"]', label: 'Shift eligibility' },
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="templates-table"]', label: 'The table' },
      { selector: '[data-test^="edit-template-"]', label: 'Set it up or Edit' },
    ],
  },
  {
    name: 'rota/template-edit',
    persona: admin,
    url: '/rota/manage/templates',
    marker: '[data-test="templates-table"]',
    width: CONSOLE_WIDTH,
    after: openFirst('[data-test^="edit-template-"]'),
    annotations: [
      { selector: '[data-test="slot-DUTY_MANAGER"]', label: 'Duty manager' },
      { selector: '[data-test="slot-DOOR"]', label: 'Door' },
      { selector: '[data-test="slot-BAR"]', label: 'Bar' },
      { selector: '[data-test="template-submit"]', label: 'Save it' },
    ],
  },
  {
    name: 'rota/approvals',
    persona: foh,
    url: '/rota/manage/approvals',
    marker: '[data-test="approvals-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="approvals-table"]', label: 'Waiting claims' },
      { selector: '[data-test="approvals-total"]', label: 'Claims waiting' },
    ],
  },
  {
    name: 'rota/board',
    persona: foh,
    url: '/rota/manage/shifts',
    marker: '[data-test="rota-board"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test^="performance-"]', label: 'A performance' },
      { selector: '[data-test^="assign-"]', label: 'Assign' },
      { selector: '[data-test^="confirmed-count-"]', label: 'Confirmed count' },
      { selector: '[data-test^="add-shift-"]', label: 'Add a shift' },
    ],
  },
  {
    name: 'rota/board-assign',
    persona: foh,
    url: '/rota/manage/shifts',
    marker: '[data-test="rota-board"]',
    width: CONSOLE_WIDTH,
    after: openFirst('[data-test^="assign-"]'),
    annotations: [
      { selector: '[data-test="assign-candidate"]', label: 'Candidate search' },
      { selector: '[data-test="assign-submit"]', label: 'Assign' },
    ],
  },
  {
    name: 'rota/checklists',
    persona: foh,
    url: '/rota/manage/checklists',
    marker: '[data-test="checklists-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="checklists-table"]', label: 'A venue\'s checklist' },
      { selector: '[data-test^="add-item-"]', label: 'Add an item' },
    ],
  },
  {
    name: 'rota/checklist-item',
    persona: foh,
    url: '/rota/manage/checklists',
    marker: '[data-test="checklists-table"]',
    width: CONSOLE_WIDTH,
    after: openFirst('[data-test^="add-item-"]'),
    annotations: [
      { selector: '[data-test="item-phase"]', label: 'Phase' },
      { selector: '[data-test="item-label"]', label: 'Label' },
      { selector: '[data-test="item-sort"]', label: 'Order' },
      { selector: '[data-test="item-system-check"]', label: 'How it ticks' },
      { selector: '[data-test="item-required"]', label: 'Required' },
      { selector: '[data-test="item-submit"]', label: 'Save it' },
    ],
  },
  {
    name: 'rota/emergency',
    persona: foh,
    url: '/rota/manage/emergency',
    marker: '[data-test="emergency-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="emergency-table"]', label: 'The venue table' },
      { selector: '[data-test^="edit-emergency-"]', label: 'Set it up or Edit' },
    ],
  },
  {
    name: 'rota/emergency-card',
    persona: foh,
    url: '/rota/manage/emergency',
    marker: '[data-test="emergency-table"]',
    width: CONSOLE_WIDTH,
    after: openFirst('[data-test^="edit-emergency-"]'),
    annotations: [
      { selector: '[data-test="field-address"]', label: 'Address' },
      { selector: '[data-test="field-assembly"]', label: 'Assembly point' },
      { selector: '[data-test="field-exits"]', label: 'Exits' },
      { selector: '[data-test="field-isolation"]', label: 'Isolation points' },
    ],
  },
  {
    name: 'rota/safety',
    persona: admin,
    url: '/rota/manage/safety',
    marker: '[data-test="severity-config"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="severity-config"]', label: 'Severity routing' },
      { selector: '[data-test="severity-toggle-SERIOUS"]', label: 'A switch' },
      { selector: '[data-test="open-items"]', label: 'Open follow-ups' },
    ],
  },
  {
    name: 'rota/age-checks',
    persona: foh,
    url: '/rota/manage/age-checks',
    marker: '[data-test="export-panel"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="export-from"]', label: 'From' },
      { selector: '[data-test="export-to"]', label: 'To' },
      { selector: '[data-test="export-csv"]', label: 'Export CSV' },
      { selector: '[data-test="export-pdf"]', label: 'Export PDF' },
    ],
  },
  {
    name: 'rota/backstage',
    persona: foh,
    url: '/rota/manage/backstage',
    marker: '[data-test="milestone-types"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="milestone-types"]', label: 'Milestone types' },
      { selector: '[data-test="add-milestone-type"]', label: 'Add a milestone type' },
      { selector: '[data-test="presets"]', label: 'Presets' },
      { selector: '[data-test="add-preset"]', label: 'Add a preset' },
    ],
  },
]
