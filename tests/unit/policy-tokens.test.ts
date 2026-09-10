import { describe, expect, test } from 'bun:test'
import {
  formatPolicyValue,
  policyTokenProblem,
  policyValueFor,
  resolvePolicyTree,
  tokensInText,
  tokensInTree,
} from '#shared/utils/policy-tokens'
import type { PolicyValues } from '#shared/utils/policy-tokens'

// J-110: a policy page quotes the setting the write path enforces, formatted for what it measures,
// and says so plainly when it cannot (0012). The pure half; the page itself is tests/e2e/policy-pages.

const tree = (...nodes: unknown[]): { type: 'minimark', value: unknown[] } =>
  ({ type: 'minimark', value: nodes })

describe('finding the tokens on a page (criteria 1, 3)', () => {
  test('a token is a configuration key in double braces, spaces allowed', () => {
    expect(tokensInText('up to {{ROOM_MAX_BOOKING_HOURS}} hours')).toEqual(['ROOM_MAX_BOOKING_HOURS'])
    expect(tokensInText('up to {{ ROOM_MAX_BOOKING_HOURS }} hours')).toEqual(['ROOM_MAX_BOOKING_HOURS'])
  })

  test('prose with no token yields none, and lower case is not a token', () => {
    expect(tokensInText('bookings run to a maximum of four hours')).toEqual([])
    expect(tokensInText('{{not_a_key}}')).toEqual([])
  })

  test('every token in a parsed page is found, however deep it sits', () => {
    const body = tree(
      ['p', {}, 'up to {{ROOM_MAX_BOOKING_HOURS}} hours'],
      ['ul', {}, ['li', {}, 'and ', ['strong', {}, '{{ROOM_ACTIVE_BOOKINGS_PER_MEMBER}}'], ' at a time']],
    )
    expect(tokensInTree(body).sort()).toEqual(['ROOM_ACTIVE_BOOKINGS_PER_MEMBER', 'ROOM_MAX_BOOKING_HOURS'])
  })

  test('the same token twice on a page is named once', () => {
    expect(tokensInTree(tree(['p', {}, '{{ROOM_FEED_WEEKS}} and {{ROOM_FEED_WEEKS}}']))).toEqual(['ROOM_FEED_WEEKS'])
  })
})

describe('formatted for what it measures (criterion 2)', () => {
  test('a duration reads as its unit, singular when it is one', () => {
    expect(formatPolicyValue('ROOM_MAX_BOOKING_HOURS', 4)).toBe('4 hours')
    expect(formatPolicyValue('ROOM_MAX_BOOKING_HOURS', 1)).toBe('1 hour')
    expect(formatPolicyValue('ROOM_MIN_BOOKING_MINUTES', 30)).toBe('30 minutes')
    expect(formatPolicyValue('ROOM_NO_SHOW_WINDOW_DAYS', 365)).toBe('365 days')
    expect(formatPolicyValue('ROOM_BOOKING_HORIZON_WEEKS', 12)).toBe('12 weeks')
    expect(formatPolicyValue('TRAINING_LEDGER_MONTHS', 24)).toBe('24 months')
    expect(formatPolicyValue('RETENTION_GUEST_YEARS', 3)).toBe('3 years')
  })

  // The unit is read from the key's own name, so a key cannot carry a label that disagrees with
  // what it is called. It is the last unit word, so a window in minutes reads in minutes.
  test('the unit is the last one named in the key, not the last word', () => {
    expect(formatPolicyValue('HOLD_RELEASE_MINUTES_BEFORE', 15)).toBe('15 minutes')
    expect(formatPolicyValue('EXTERNAL_REQUEST_NOTICE_WORKING_DAYS', 3)).toBe('3 days')
  })

  test('money is pence formatted as pounds, never as a bare number', () => {
    expect(formatPolicyValue('BAR_TAB_CAP_PENCE', 2000)).toBe('£20.00')
    expect(formatPolicyValue('BAR_TAB_CAP_PENCE', 2050)).toBe('£20.50')
  })

  test('a percentage carries its sign', () => {
    expect(formatPolicyValue('LISTING_LIMITED_THRESHOLD_PERCENT', 10)).toBe('10%')
  })

  test('a rule that is on or off reads as words, not as true', () => {
    expect(formatPolicyValue('ROOM_MAX_BOOKING_ADMINS_EXEMPT', true)).toBe('yes')
    expect(formatPolicyValue('REFUND_UNPAID_CANCELLATION_FREE', false)).toBe('no')
  })

  test('a list reads as a sentence, not as JSON', () => {
    expect(formatPolicyValue('ROOM_PRIORITY_TIERS', ['PRODUCTION', 'COMMITTEE', 'GENERAL']))
      .toBe('production, committee and general')
    expect(formatPolicyValue('ROOM_PURPOSES', ['READ_THROUGH'])).toBe('read through')
  })

  test('a count with no unit in its name is the number itself', () => {
    expect(formatPolicyValue('ROOM_ACTIVE_BOOKINGS_PER_MEMBER', 10)).toBe('10')
    expect(formatPolicyValue('PUBLIC_ORDER_SEAT_CAP', 10)).toBe('10')
  })
})

describe('which keys a public page may quote at all', () => {
  const state = {
    known: true,
    sensitive: false,
    set: true,
    enforced: true,
    value: 4,
  }

  test('a known, set, ordinary key resolves', () => {
    expect(policyValueFor('ROOM_MAX_BOOKING_HOURS', state)).toEqual({ text: '4 hours', enforced: true })
  })

  // A page a visitor reads may not publish a setting that names people (0011, 0024).
  test('a key holding personal data never resolves, whatever its value', () => {
    expect(policyValueFor('NIGHT_REPORT_RECIPIENTS', { ...state, sensitive: true })).toBeNull()
  })

  test('a key nobody has set does not resolve, because there is no rule to quote', () => {
    expect(policyValueFor('RETENTION_WARNING_DAYS', { ...state, set: false, value: undefined })).toBeNull()
  })

  test('a key the schema does not have does not resolve', () => {
    expect(policyValueFor('NOT_A_KEY', { ...state, known: false })).toBeNull()
  })

  // Criterion 5: the rule is quoted and marked, rather than hidden, which is the honest state.
  test('a stated but unenforced rule resolves and says it is not enforced', () => {
    expect(policyValueFor('REFUND_UNPAID_CANCELLATION_FREE', { ...state, enforced: false, value: true }))
      .toEqual({ text: 'yes', enforced: false })
  })
})

describe('what CI refuses in a page (criterion 3)', () => {
  test('a key the schema has is allowed', () => {
    expect(policyTokenProblem('ROOM_MAX_BOOKING_HOURS', { known: true, sensitive: false })).toBeNull()
  })

  test('a key the schema does not have names itself in the refusal', () => {
    expect(policyTokenProblem('ROOM_MAX_HOURS', { known: false, sensitive: false })).toContain('ROOM_MAX_HOURS')
  })

  // The build refuses this rather than leaving it to the renderer: a page naming the night report
  // recipients would publish committee addresses the moment somebody previewed it.
  test('a key holding personal data is refused at the build, not only at render', () => {
    expect(policyTokenProblem('NIGHT_REPORT_RECIPIENTS', { known: true, sensitive: true }))
      .toContain('personal data')
  })
})

describe('what a page renders (criteria 2, 4, 5)', () => {
  const values: PolicyValues = {
    ROOM_MAX_BOOKING_HOURS: { text: '4 hours', enforced: true },
    REFUND_UNPAID_CANCELLATION_FREE: { text: 'yes', enforced: false },
  }

  test('a resolved token becomes the live value in the prose', () => {
    const resolved = resolvePolicyTree(tree(['p', {}, 'up to {{ROOM_MAX_BOOKING_HOURS}} at a time']), values)
    expect(JSON.stringify(resolved)).toContain('4 hours')
    expect(JSON.stringify(resolved)).not.toContain('{{')
  })

  test('the text around a token is kept, in order', () => {
    const resolved = resolvePolicyTree(tree(['p', {}, 'up to {{ROOM_MAX_BOOKING_HOURS}} at a time']), values)
    const paragraph = (resolved.value[0] as unknown[]).slice(2)
    expect(paragraph[0]).toBe('up to ')
    expect(paragraph[2]).toBe(' at a time')
  })

  // Criterion 4. A token nobody can resolve is the one thing that must never render as blank or
  // as stale text: the page would then publish a rule the write path does not enforce.
  test('an unresolvable token renders as a visible error naming the key', () => {
    const resolved = resolvePolicyTree(tree(['p', {}, 'we keep it for {{RETENTION_WARNING_DAYS}}']), values)
    const rendered = JSON.stringify(resolved)
    expect(rendered).toContain('policy-error')
    expect(rendered).toContain('RETENTION_WARNING_DAYS')
    expect(rendered).not.toContain('{{')
  })

  test('an unenforced rule renders marked, not silently like any other value', () => {
    const resolved = resolvePolicyTree(tree(['p', {}, 'free: {{REFUND_UNPAID_CANCELLATION_FREE}}']), values)
    const rendered = JSON.stringify(resolved)
    expect(rendered).toContain('policy-unenforced')
    expect(rendered).toContain('not enforced yet')
  })

  test('a page with no token is handed on unchanged', () => {
    const original = tree(['p', {}, 'nothing to resolve here'])
    expect(resolvePolicyTree(original, values)).toEqual(original)
  })

  test('tokens inside a nested element resolve too, and their siblings survive', () => {
    const resolved = resolvePolicyTree(
      tree(['ul', {}, ['li', {}, 'at most ', ['strong', {}, '{{ROOM_MAX_BOOKING_HOURS}}'], ' each']]),
      values,
    )
    const rendered = JSON.stringify(resolved)
    expect(rendered).toContain('4 hours')
    expect(rendered).toContain('at most ')
    expect(rendered).toContain(' each')
  })
})
