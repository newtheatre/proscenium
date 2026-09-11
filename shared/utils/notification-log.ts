import { z } from 'zod'
import { pageQuery } from './pagination'

// The operations view of what was sent (H-106), read-only, kept out of `notify.ts`'s own file
// (H-105). Its query schema is derived from `send-log-list.ts`'s declaration (K-129).

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
