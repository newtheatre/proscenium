import { describe, expect, test } from 'bun:test'
import { AUDIT_ACTIONS } from '#shared/utils/audit-actions'
import { AUDIT_COVERAGE } from '#shared/utils/audit-coverage'
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_BODY_MIN,
  FEEDBACK_KINDS,
  FEEDBACK_LIMIT,
  FEEDBACK_STATUSES,
  RECENT_FAILURES_CAP,
  feedbackForm,
  rememberFailure,
} from '#shared/utils/feedback'
import { PERSONAL_TABLES } from '#shared/utils/personal-data'
import type { RecentFailure } from '#shared/utils/feedback'

// K-134: the report form's bounds and what the browser remembers. The row's behaviour under
// erasure and triage is tests/integration/feedback; the button and the route are tests/e2e/feedback.

const valid = { kind: 'BUG', body: 'The till froze after the second scan.', path: '/tonight/till', shell: 'tonight' }

describe('the form asks two things and attaches the rest (criterion 2)', () => {
  test('a kind, the words, the path and the shell are enough', () => {
    const parsed = feedbackForm.parse(valid)
    expect(parsed.recentFailures).toEqual([])
    expect(parsed.userAgent).toBeUndefined()
  })

  test('the words are bounded at both ends', () => {
    expect(feedbackForm.safeParse({ ...valid, body: 'x'.repeat(FEEDBACK_BODY_MIN - 1) }).success).toBe(false)
    expect(feedbackForm.safeParse({ ...valid, body: 'x'.repeat(FEEDBACK_BODY_MIN) }).success).toBe(true)
    expect(feedbackForm.safeParse({ ...valid, body: 'x'.repeat(FEEDBACK_BODY_MAX) }).success).toBe(true)
    expect(feedbackForm.safeParse({ ...valid, body: 'x'.repeat(FEEDBACK_BODY_MAX + 1) }).success).toBe(false)
  })

  test('whitespace around the words does not count towards the minimum', () => {
    expect(feedbackForm.safeParse({ ...valid, body: `   ${'x'.repeat(FEEDBACK_BODY_MIN - 1)}   ` }).success).toBe(false)
  })

  test('only the two kinds and the two shells are accepted', () => {
    expect(FEEDBACK_KINDS).toEqual(['BUG', 'IDEA'])
    expect(feedbackForm.safeParse({ ...valid, kind: 'RANT' }).success).toBe(false)
    expect(feedbackForm.safeParse({ ...valid, shell: 'docs' }).success).toBe(false)
  })

  test('the browser may attach at most the cap of recent failures, each bounded', () => {
    const failure: RecentFailure = { path: '/api/tonight/till', status: 500, message: 'Something went wrong', ray: 'abc123', at: 1_790_000_000 }
    expect(feedbackForm.safeParse({ ...valid, recentFailures: Array.from({ length: RECENT_FAILURES_CAP }, () => failure) }).success).toBe(true)
    expect(feedbackForm.safeParse({ ...valid, recentFailures: Array.from({ length: RECENT_FAILURES_CAP + 1 }, () => failure) }).success).toBe(false)
    expect(feedbackForm.safeParse({ ...valid, recentFailures: [{ ...failure, message: 'x'.repeat(201) }] }).success).toBe(false)
  })
})

describe('the browser remembers the last few failures and no more (criterion 2)', () => {
  const failureAt = (at: number): RecentFailure => ({ path: '/api/x', status: 503, message: 'down', at })

  test('newest last, oldest dropped once the cap is reached', () => {
    let buffer: RecentFailure[] = []
    for (let at = 1; at <= RECENT_FAILURES_CAP + 2; at++) buffer = rememberFailure(buffer, failureAt(at))
    expect(buffer).toHaveLength(RECENT_FAILURES_CAP)
    expect(buffer[0]!.at).toBe(3)
    expect(buffer.at(-1)!.at).toBe(RECENT_FAILURES_CAP + 2)
  })

  test('the buffer handed in is not mutated', () => {
    const before = [failureAt(1)]
    rememberFailure(before, failureAt(2))
    expect(before).toHaveLength(1)
  })
})

describe('the write is limited, audited and erasable (criteria 3, 4, 5)', () => {
  test('ten an hour per reporter', () => {
    expect(FEEDBACK_LIMIT).toEqual({ scope: 'feedback', limit: 10, windowMinutes: 60 })
  })

  test('the action is in the catalogue and the route is covered', () => {
    expect(AUDIT_ACTIONS['feedback.submitted']?.module).toBe('governance')
    const covered = AUDIT_COVERAGE.find(entry => entry.route === 'server/api/feedback/index.post.ts')
    expect(covered && 'actions' in covered ? covered.actions : []).toEqual(['feedback.submitted'])
  })

  test('the row is personal data whose words and browser details are scrubbed, and it stays', () => {
    const entry = PERSONAL_TABLES.find(table => table.name === 'feedback_reports')
    expect(entry?.column).toBe('reporter_id')
    expect(entry?.erasure).toBe('scrub')
    expect(entry?.scrub).toEqual(['body', 'user_agent', 'recent_failures'])
    expect(entry?.columns).not.toContain('body')
  })

  test('the statuses the triage run may write are a fixed vocabulary', () => {
    expect(FEEDBACK_STATUSES).toEqual(['NEW', 'TRIAGED', 'DONE', 'DISMISSED'])
  })
})
