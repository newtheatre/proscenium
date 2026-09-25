import { CONSOLE_WIDTH } from './types'
import type { Shot } from './types'

const persona = 'dev-admin@e2e.newtheatre.org.uk'

// The directory's ids are random per database, so an account is reached by clicking the first
// row's link rather than by URL.
const openFirstAccount = `document.querySelector('[data-test="directory-table"] a[href^="/people/accounts/"]').click()`

export const people: Shot[] = [
  {
    name: 'people/accounts',
    persona,
    url: '/people/accounts',
    marker: '[data-test="directory-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters' },
      { selector: '[data-test="invite"]', label: 'Add someone' },
      { selector: '[data-test="directory-table"]', label: 'The table' },
    ],
  },
  {
    name: 'people/account',
    persona,
    url: '/people/accounts',
    marker: '[data-test="directory-table"]',
    width: CONSOLE_WIDTH,
    after: openFirstAccount,
    annotations: [
      { selector: '[data-test="account-name"]', label: 'The name and state' },
      { selector: '[data-test="grant-role"]', label: 'Grant a role' },
      { selector: '[data-test="grant-until"]', label: 'Until' },
      { selector: '[data-test="grant-submit"]', label: 'Grant it' },
    ],
  },
  {
    name: 'people/account-security',
    persona,
    url: '/people/accounts',
    marker: '[data-test="directory-table"]',
    width: CONSOLE_WIDTH,
    after: `${openFirstAccount}; setTimeout(() => document.querySelector('[data-test="sign-out-everywhere"]').scrollIntoView({ block: 'start' }), 900)`,
    annotations: [
      { selector: '[data-test="sign-out-everywhere"]', label: 'Sign out everywhere' },
      { selector: '[data-test="disable"]', label: 'Disable the account' },
      { selector: '[data-test="reset-mfa"]', label: 'Reset the authenticator' },
      { selector: '[data-test="erase-reveal"]', label: 'Erase this account' },
      { selector: '[data-test="merge-winner"]', label: 'The winning account' },
    ],
  },
  {
    name: 'people/members',
    persona,
    url: '/people/members',
    marker: '[data-test="members-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters' },
      { selector: '[data-test="record-membership"]', label: 'Record one' },
      { selector: '[data-test="members-export"]', label: 'Export' },
      { selector: '[data-test="members-table"]', label: 'The table' },
    ],
  },
  {
    name: 'people/members-claims',
    persona,
    url: '/people/members?filter=awaiting-record',
    marker: '[data-test="claims-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-filters"]', label: 'Filters' },
      { selector: '[data-test="claims-table"]', label: 'The queue' },
      { selector: '[data-test="members-total"]', label: 'The total line' },
    ],
  },
  {
    name: 'people/fellows',
    persona,
    url: '/people/fellows',
    marker: '[data-test="fellows-table"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="toolbar-search"]', label: 'Search' },
      { selector: '[data-test="toolbar-filters"]', label: 'Filters' },
      { selector: '[data-test="award"]', label: 'Record an award' },
      { selector: '[data-test="fellows-table"]', label: 'The table' },
    ],
  },
]
