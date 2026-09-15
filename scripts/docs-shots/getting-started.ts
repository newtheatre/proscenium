import { CONSOLE_WIDTH, PHONE_WIDTH } from './types'
import type { Shot } from './types'

const member = 'dev-member@e2e.newtheatre.org.uk'

// The sign-in screen has no picture: it sends a signed-in persona away, and the runner has no
// signed-out persona to capture it with.
export const gettingStarted: Shot[] = [
  {
    name: 'getting-started/my',
    persona: member,
    url: '/my',
    marker: '[data-test="my-page"]',
    width: PHONE_WIDTH,
    annotations: [
      { selector: '[data-test="account-menu"]', label: 'Your name' },
      { selector: '[data-test="docs-link"]', label: 'The help button' },
      { selector: '[aria-label="My theatre"]', label: 'The strip' },
      { selector: '[data-test="my-page"] h1', label: 'The heading' },
    ],
  },
  {
    name: 'getting-started/security',
    persona: member,
    url: '/account/security',
    marker: '[data-test="account-security-page"]',
    width: CONSOLE_WIDTH,
    annotations: [
      { selector: '[data-test="methods"]', label: 'How you sign in' },
      { selector: '[data-test="new-email"]', label: 'Email address' },
      { selector: '[data-test="mfa-active"]', label: 'An authenticator app' },
      { selector: '[data-test="regenerate"]', label: 'Show a new set of recovery codes' },
    ],
  },
  {
    name: 'getting-started/account-menu',
    persona: 'dev-admin@e2e.newtheatre.org.uk',
    url: '/admin',
    marker: '[data-test="delivery-trouble"]',
    width: CONSOLE_WIDTH,
    after: `document.querySelector('[data-test="account-menu"]').click()`,
    annotations: [
      { selector: '[data-test="account-menu"]', label: 'Your name' },
      { selector: '[role="menu"]', label: 'The menu' },
      { selector: '.sign-out', label: 'Sign out' },
    ],
  },
]
