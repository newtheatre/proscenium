import { PHONE_WIDTH } from './types'
import type { Shot } from './types'

// The front of house manager opens the door and the duty manager screens with no shift (0044);
// the bar manager opens the till. The seed runs two performances at the house tonight.
const foh = 'dev-foh@e2e.newtheatre.org.uk'
const bar = 'dev-bar@e2e.newtheatre.org.uk'

export const showNight: Shot[] = [
  {
    name: 'show-night/hub',
    persona: foh,
    url: '/tonight',
    marker: '[data-test="tonight-hub"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="night-shift-badge"]', label: 'How you got in' },
      { selector: '[data-test="performance-switcher"]', label: 'Which performance' },
      { selector: '[data-test="tonight-kpis"]', label: 'House numbers' },
      { selector: '[data-test="tile-scan"]', label: 'Scan ticket' },
      { selector: '[data-test="tile-passes"]', label: 'Admit pass holder' },
      { selector: '[data-test="tile-emergency"]', label: 'Emergency' },
    ],
  },
  {
    name: 'show-night/door',
    persona: foh,
    url: '/tonight/door',
    marker: '[data-test="door-screen"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="door-performance"]', label: 'Performance' },
      // The camera where the device has one, the typed field where it does not.
      { selector: '[data-test="qr-scanner"], [data-test="door-reference"]', label: 'The camera, or the reference' },
      { selector: '[data-test="link-age-checks"]', label: 'Challenge 25' },
      { selector: '[data-test="night-back"]', label: 'Back to tonight' },
    ],
  },
  {
    name: 'show-night/door-pass-mode',
    persona: foh,
    url: '/tonight/door?mode=pass',
    marker: '[data-test="door-pass-mode"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="pass-search"]', label: 'Find the holder' },
      { selector: '[data-test="door-performance"]', label: 'Performance' },
    ],
  },
  {
    name: 'show-night/glance',
    persona: foh,
    url: '/tonight/glance',
    marker: '[data-test="glance-numbers"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="performance-switcher"]', label: 'Which performance' },
      { selector: '[data-test="glance-numbers"]', label: 'The numbers' },
      { selector: '[data-test="glance-passes"]', label: 'Pass pressure' },
      { selector: '[data-test="glance-show-info"]', label: 'Show info' },
      { selector: '[data-test="night-stale"]', label: 'Last synced' },
    ],
  },
  {
    name: 'show-night/till',
    persona: bar,
    url: '/tonight/till',
    marker: '[data-test="till-panes"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="till-open"]', label: 'Open since' },
      { selector: '[data-test="till-panes"] button[role="tab"]:nth-of-type(1)', label: 'Bar' },
      { selector: '[data-test="till-panes"] button[role="tab"]:nth-of-type(2)', label: 'Tickets' },
      { selector: 'button[data-test^="product-"]', label: 'A product' },
      { selector: '[data-test^="allergen-"]', label: 'Allergens' },
      { selector: '[data-test="till-overflow-menu"]', label: 'Close till (not a per-sale action)' },
    ],
  },
  {
    name: 'show-night/till-comp',
    persona: bar,
    url: '/tonight/till',
    marker: '[data-test="till-panes"]',
    width: PHONE_WIDTH,
    // An unrestricted product, so no Challenge 25 sheet sits under the comp; the size sheet and a
    // mixer are answered if they appear, since the comp chip needs a priced basket.
    after: '[...document.querySelectorAll(\'button[data-test^="product-"]\')].find(tile => !tile.querySelector(\'[data-test^="restricted-mark-"]\'))?.click(); '
      + 'setTimeout(() => document.querySelector(\'[data-test="size-sheet"] [data-test^="variant-"]:not([disabled])\')?.click(), 300); '
      + 'setTimeout(() => document.querySelector(\'[data-test^="choice-option-"]\')?.click(), 700); '
      + 'setTimeout(() => document.querySelector(\'[data-test="till-comp-chip"]\')?.click(), 1100)',
    annotations: [
      { selector: '[data-test="comp-request-total"]', label: 'What is being given away' },
      { selector: '[data-test="comp-reason"]', label: 'Why, on the record' },
      { selector: '[data-test="comp-send"]', label: 'Ask' },
    ],
  },
  {
    name: 'show-night/age-checks',
    persona: foh,
    url: '/tonight/age-checks',
    marker: '[data-test="age-checks-list"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="night-stale"]', label: 'Last synced' },
      { selector: '[data-test="age-checks-list"]', label: 'Tonight\'s register' },
      { selector: '[data-test="open-log-check"]', label: 'Log a check' },
    ],
  },
  {
    name: 'show-night/age-checks-log',
    persona: foh,
    url: '/tonight/age-checks',
    marker: '[data-test="age-checks-list"]',
    width: PHONE_WIDTH,
    after: 'document.querySelector(\'[data-test="open-log-check"]\').click()',
    annotations: [
      { selector: '[data-test="log-outcome"]', label: 'Outcome' },
      { selector: '[data-test="log-id-type"]', label: 'ID shown' },
      { selector: '[data-test="log-description"]', label: 'Who you checked' },
      { selector: '[data-test="log-submit"]', label: 'Log it' },
    ],
  },
  {
    name: 'show-night/checklist',
    persona: foh,
    url: '/tonight/checklist',
    marker: '[data-test="close-night"]',
    width: PHONE_WIDTH,
    annotations: [
      // The list where one performance runs; the house to choose where two do.
      { selector: '[data-test="checklist-list"], [data-test="checklist-performance-switcher"], [data-test="checklist-failure"]', label: 'The checklist' },
      { selector: '[data-test="close-night"]', label: 'Close the night' },
    ],
  },
  {
    name: 'show-night/incidents',
    persona: foh,
    url: '/tonight/incidents',
    marker: '[data-test="incidents-list"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="tonight-team"]', label: 'On tonight' },
      { selector: '[data-test="incidents-list"]', label: 'The log' },
      { selector: '[data-test="night-actions"]', label: 'Log an incident and Report a near miss' },
    ],
  },
  {
    name: 'show-night/emergency',
    persona: foh,
    url: '/tonight/emergency',
    marker: '[data-test="emergency-999"]',
    width: PHONE_WIDTH,
    height: 1700,
    annotations: [
      { selector: '[data-test="emergency-999"]', label: 'Read to 999' },
      { selector: '[data-test="emergency-duty-manager"]', label: 'After 999' },
      { selector: '[data-test="emergency-evacuation"]', label: 'Evacuation' },
      { selector: '[data-test="emergency-first-aid"]', label: 'First aid' },
      { selector: '[data-test="emergency-as-of"]', label: 'When it was filed' },
    ],
  },
  {
    name: 'show-night/board',
    persona: foh,
    url: '/tonight/board',
    marker: '[data-test="board-current"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="board-current"]', label: 'Current state' },
      { selector: '[data-test="board-presets"]', label: 'Presets' },
      { selector: '[data-test="board-free-text-input"]', label: 'Free text' },
      { selector: '[data-test="board-code-reveal"]', label: 'Tonight\'s code' },
      { selector: '[data-test="board-reset-open"]', label: 'Reset the board' },
    ],
  },
  {
    name: 'show-night/board-join',
    persona: foh,
    url: '/board',
    marker: '[data-test="board-join-form"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="board-code-input"]', label: 'Code' },
      { selector: '[data-test="board-label-input"]', label: 'Your name or role' },
      { selector: '[data-test="board-join-submit"]', label: 'Join' },
    ],
  },
]
