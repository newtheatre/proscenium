import { CONSOLE_WIDTH } from './types'
import type { Shot } from './types'

const persona = 'dev-foh@e2e.newtheatre.org.uk'

// Presses the desk's own next-night button until a night with a performance is showing, for up to
// a fortnight of nights, so the picture never depends on which night the seed ran.
export const DESK_FINDS_A_NIGHT = `const step = (left) => { `
  + `if (document.querySelector('[data-test="desk-performance"]') || left === 0) return; `
  + `document.querySelector('[data-test="desk-next-night"]')?.click(); `
  + `setTimeout(() => step(left - 1), 800) }; step(14)`

export const boxOffice: Shot[] = [
  {
    name: 'box-office/desk',
    persona,
    url: '/box-office/desk',
    marker: '[data-test="desk-page"]',
    width: CONSOLE_WIDTH,
    // A seed run on another show night can leave tonight with no performance: step on to the
    // next night that has one, as an officer would, rather than picture an empty desk.
    after: DESK_FINDS_A_NIGHT,
    ready: `document.querySelector('[data-test="desk-summary"]')`,
    annotations: [
      { selector: '[data-test="desk-night"]', label: 'The night' },
      { selector: '[data-test="desk-performance"]', label: 'Performance' },
      { selector: '[data-test="desk-summary"]', label: 'Summary tiles' },
      { selector: '[data-test="desk-scan-camera"]', label: 'Scan with the camera' },
      { selector: '[data-test="desk-search"]', label: 'Search' },
      { selector: '[data-test="desk-results"]', label: 'Results' },
    ],
  },
  {
    name: 'box-office/desk-passes',
    persona,
    url: '/box-office/desk-passes',
    marker: '[data-test="desk-passes-page"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="desk-pass-type"]', label: 'Pass' },
      { selector: '[data-test="desk-pass-price"]', label: 'Price point' },
      { selector: '[data-test="person-picker"]', label: 'Buyer' },
      { selector: '[data-test="desk-pass-due"]', label: 'Due now' },
      { selector: '[data-test="desk-pass-issue"]', label: 'Issue' },
    ],
  },
  {
    name: 'box-office/shows',
    persona,
    url: '/box-office/shows',
    marker: '[data-test="shows-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="shows-season-line"]', label: 'Season line' },
      { selector: '[data-test="toolbar-search"]', label: 'Search and filters' },
      { selector: '[data-test="add-show"]', label: 'Add a show' },
      { selector: '[data-test="shows-table"]', label: 'The table' },
    ],
  },
  {
    // The detail page needs a seeded show, so the list is opened first and its first row followed.
    name: 'box-office/show',
    persona,
    url: '/box-office/shows',
    marker: '[data-test="shows-table"]',
    width: CONSOLE_WIDTH,
    // The rail's checklist and danger zone reach past the default height (issue 1323).
    height: 1400,
    after: 'document.querySelector(\'[data-test^="open-"]\')?.click()',
    annotations: [
      { selector: '[data-test="show-strip"]', label: 'Status strip' },
      { selector: '[data-test="show-tabs"]', label: 'Tabs' },
      { selector: '[data-test="poster-card"]', label: 'Poster' },
      { selector: '[data-test="publish-checklist"]', label: 'Publish checklist' },
      { selector: '[data-test="danger-zone"]', label: 'Danger zone' },
    ],
  },
  {
    name: 'box-office/venues',
    persona,
    url: '/box-office/venues',
    marker: '[data-test="venues-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search and filter' },
      { selector: '[data-test="add-venue"]', label: 'Add a venue' },
      { selector: '[data-test="venues-table"]', label: 'The table' },
    ],
  },
  {
    name: 'box-office/seasons',
    persona,
    url: '/box-office/seasons',
    marker: '[data-test="seasons-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search and filter' },
      { selector: '[data-test="add-season"]', label: 'Add a season' },
      { selector: '[data-test="seasons-table"]', label: 'The table' },
    ],
  },
  {
    name: 'box-office/show-categories',
    persona,
    url: '/box-office/show-categories',
    marker: '[data-test="categories-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search and filter' },
      { selector: '[data-test="add-category"]', label: 'Add a category' },
      { selector: '[data-test="categories-table"]', label: 'The table' },
    ],
  },
  {
    name: 'box-office/ticket-types',
    persona,
    url: '/box-office/ticket-types',
    marker: '[data-test="ticket-types-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search and filter' },
      { selector: '[data-test="add-ticket-type"]', label: 'Add a ticket type' },
      { selector: '[data-test="ticket-types-table"]', label: 'The table' },
    ],
  },
  {
    name: 'box-office/pass-types',
    persona,
    url: '/box-office/pass-types',
    marker: '[data-test="pass-types-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search and filter' },
      { selector: '[data-test="add-pass-type"]', label: 'Add a pass' },
      { selector: '[data-test="pass-types-table"]', label: 'The table' },
    ],
  },
  {
    name: 'box-office/content-warnings',
    persona,
    url: '/box-office/content-warnings',
    marker: '[data-test="warnings-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search and filter' },
      { selector: '[data-test="add-warning"]', label: 'Add a warning' },
      { selector: '[data-test="warnings-table"]', label: 'The table' },
    ],
  },
  {
    name: 'box-office/access-profiles',
    persona: 'dev-secretary@e2e.newtheatre.org.uk',
    url: '/box-office/access-profiles',
    marker: '[data-test="access-profiles-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search and filter' },
      { selector: '[data-test="access-profiles-table"]', label: 'The table' },
      { selector: '[data-test="review"]', label: 'Review' },
    ],
  },
]
