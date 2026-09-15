import { CONSOLE_WIDTH, PHONE_WIDTH } from './types'
import type { Shot } from './types'

const persona = 'dev-training@e2e.newtheatre.org.uk'

// The seed lists sessions soonest first: a delivered one, a cancelled one, then the open one.
const openSession = 'document.querySelectorAll(\'[data-test^="open-"]\')[2].click()'

// Into the delivered session, then on to its register once the page has the button.
const deliveredRegister = `(() => {
  document.querySelectorAll('[data-test^="open-"]')[0].click()
  const started = Date.now()
  const poll = setInterval(() => {
    const button = document.querySelector('[data-test="take-register"]')
    if (button) { clearInterval(poll); button.click() }
    else if (Date.now() - started > 1000) clearInterval(poll)
  }, 50)
})()`

export const training: Shot[] = [
  {
    name: 'training/catalogue',
    persona,
    url: '/training/manage',
    marker: '[data-test="modules-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters' },
      { selector: '[data-test="add-module"]', label: 'Add a module' },
      { selector: '[data-test="modules-table"]', label: 'The catalogue' },
      { selector: '[data-test^="edit-module-"]', label: 'Edit' },
    ],
  },
  {
    name: 'training/module-editor',
    persona,
    url: '/training/manage',
    marker: '[data-test="modules-table"]',
    width: CONSOLE_WIDTH,
    after: 'document.querySelector(\'[data-test^="edit-module-"]\').click()',
    annotations: [
      { selector: '[data-test="module-name"]', label: 'Title' },
      { selector: '[data-test="module-department"]', label: 'Department' },
      { selector: '[data-test="module-kind"]', label: 'Kind' },
      { selector: '[data-test="module-mode"]', label: 'How it is delivered' },
    ],
  },
  {
    name: 'training/departments',
    persona,
    url: '/training/manage/departments',
    marker: '[data-test="departments-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters, including retired departments' },
      { selector: '[data-test="add-department"]', label: 'Add a department' },
      { selector: '[data-test="departments-table"]', label: 'The departments' },
      { selector: '[data-test^="appoint-"]', label: 'Assign a lead' },
    ],
  },
  {
    name: 'training/records',
    persona,
    url: '/training/manage/records',
    marker: '[data-test="person-picker"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="person-picker"]', label: 'Whose records' },
    ],
  },
  {
    name: 'training/requests',
    persona,
    url: '/training/manage/requests',
    marker: '[data-test="demand-board"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="demand-board"] section[data-test^="demand-"]', label: 'A module' },
      { selector: '[data-test^="waiting-"]', label: 'Waiting' },
      { selector: '[data-test^="answer-"]', label: 'Answer' },
    ],
  },
  {
    name: 'training/sessions',
    persona,
    url: '/training/manage/sessions',
    marker: '[data-test="sessions-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters, including only sessions I am running' },
      { selector: '[data-test="add-session"]', label: 'Schedule a session' },
      { selector: '[data-test="log-session"]', label: 'Log a session' },
      { selector: '[data-test="sessions-table"]', label: 'The sessions' },
      { selector: '[data-test^="open-"]', label: 'Open' },
    ],
  },
  {
    name: 'training/schedule-session',
    persona,
    url: '/training/manage/sessions',
    marker: '[data-test="sessions-table"]',
    width: CONSOLE_WIDTH,
    after: 'document.querySelector(\'[data-test="add-session"]\').click()',
    annotations: [
      { selector: '[data-test="session-day"]', label: 'Day' },
      { selector: '[data-test="session-starts"]', label: 'Starts' },
      { selector: '[data-test="session-ends"]', label: 'Ends' },
      { selector: '[data-test="session-place"]', label: 'Where' },
      { selector: '[data-test="session-capacity"]', label: 'Places' },
    ],
  },
  {
    name: 'training/log-session',
    persona,
    url: '/training/manage/sessions',
    marker: '[data-test="sessions-table"]',
    width: CONSOLE_WIDTH,
    after: 'document.querySelector(\'[data-test="log-session"]\').click()',
    annotations: [
      { selector: '[data-test="delivery-day"]', label: 'The day it was taught' },
      { selector: '[data-test="delivery-modules"]', label: 'What was taught' },
      { selector: '[data-test="delivery-person"]', label: 'Who was there' },
      { selector: '[data-test="delivery-by-email"]', label: 'By address' },
      { selector: '[data-test="delivery-preview"]', label: 'Show me what this creates' },
    ],
  },
  {
    name: 'training/session',
    persona,
    url: '/training/manage/sessions',
    marker: '[data-test="sessions-table"]',
    width: CONSOLE_WIDTH,
    after: openSession,
    annotations: [
      { selector: '[data-test="session-status"]', label: 'Status' },
      { selector: '[data-test="take-register"]', label: 'Take the register' },
      { selector: '[data-test="cancel-session"]', label: 'Cancel this session' },
      { selector: '[data-test="session-attendees"]', label: 'Who is coming' },
    ],
  },
  {
    name: 'training/register',
    persona,
    url: '/training/manage/sessions',
    marker: '[data-test="sessions-table"]',
    width: PHONE_WIDTH,
    // The seed's only register that can be opened today is the delivered one, already marked and
    // past its window, so the picture shows the settled state rather than the marking list.
    after: deliveredRegister,
    annotations: [
      { selector: '[data-test="already-marked"]', label: 'The register has been marked' },
      { selector: '[data-test="settled-register"]', label: 'Settled' },
    ],
  },
]
