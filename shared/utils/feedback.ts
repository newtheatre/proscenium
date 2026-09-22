import { z } from 'zod'

// A report from a signed-in screen: the words, the screen it came from and what the browser saw
// go wrong (K-134). The application records; the daily triage run reads (0086).

export const FEEDBACK_KINDS = ['BUG', 'IDEA'] as const
export type FeedbackKind = typeof FEEDBACK_KINDS[number]

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  BUG: 'Something is wrong',
  IDEA: 'An idea',
}

export const FEEDBACK_STATUSES = ['NEW', 'TRIAGED', 'DONE', 'DISMISSED'] as const
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number]

// The two shells that carry the button (criterion 1).
export const FEEDBACK_SHELLS = ['console', 'tonight'] as const
export type FeedbackShell = typeof FEEDBACK_SHELLS[number]

export const FEEDBACK_BODY_MIN = 10
export const FEEDBACK_BODY_MAX = 2000
export const RECENT_FAILURES_CAP = 5

// Ten an hour per reporter, the same shape as every other limit (criterion 4).
export const FEEDBACK_LIMIT = { scope: 'feedback', limit: 10, windowMinutes: 60 } as const

// What erasure leaves where the words were: the row survives as a count (criterion 5, 0011).
export const FEEDBACK_ERASED_BODY = 'Erased report'

export const recentFailure = z.object({
  path: z.string().trim().min(1).max(200),
  status: z.number().int().min(0).max(999),
  message: z.string().trim().max(200),
  ray: z.string().trim().max(40).optional(),
  at: z.number().int().nonnegative(),
})
export type RecentFailure = z.infer<typeof recentFailure>

export const feedbackForm = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  body: z.string().trim().min(FEEDBACK_BODY_MIN).max(FEEDBACK_BODY_MAX),
  path: z.string().trim().min(1).max(200),
  shell: z.enum(FEEDBACK_SHELLS),
  userAgent: z.string().trim().max(300).optional(),
  recentFailures: z.array(recentFailure).max(RECENT_FAILURES_CAP).default([]),
})
export type FeedbackForm = z.infer<typeof feedbackForm>

// Newest last, oldest dropped: a browser remembers the last few failures and no more.
export function rememberFailure(buffer: RecentFailure[], failure: RecentFailure, cap = RECENT_FAILURES_CAP): RecentFailure[] {
  return [...buffer, failure].slice(-cap)
}
