import { z } from 'zod'
import { CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TOPICS } from './notifications'
import { pageQuery } from './pagination'

// The operations view of what was sent (H-106): filters over `notification_log`, read-only.
// Kept out of `notify.ts`'s own file, which H-105 owns.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is YYYY-MM-DD')

export const sendLogFilters = pageQuery.extend({
  type: z.string().trim().min(1).max(100).optional(),
  topic: z.enum(NOTIFICATION_TOPICS).optional(),
  channel: z.enum(CHANNELS).optional(),
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  // Both London civil days; `to` is inclusive, matching the report period fields elsewhere.
  from: isoDate.optional(),
  to: isoDate.optional(),
})

export type SendLogFilters = z.output<typeof sendLogFilters>

export interface SendLogRow {
  id: string
  userId: string | null
  recipientName: string | null
  type: string
  channel: string
  status: string
  subject: string | null
  error: string | null
  createdAt: number
  sentAt: number | null
}

// What a person's own history answers, and nothing else: outcomes, never a message body that
// might carry somebody else's data (H-106 criterion 3).
export interface PersonHistoryRow {
  id: string
  type: string
  channel: string
  status: string
  createdAt: number
  sentAt: number | null
}

export const personHistoryFilters = pageQuery.extend({
  type: z.string().trim().min(1).max(100).optional(),
})

export type PersonHistoryFilters = z.output<typeof personHistoryFilters>

export interface DailyCount {
  day: string
  type: string
  status: string
  count: number
}

export const dailyCountsFilters = z.object({
  days: z.coerce.number().int().positive().max(31).default(14),
})

export type DailyCountsFilters = z.output<typeof dailyCountsFilters>
