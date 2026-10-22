import { FEEDBACK_KINDS, FEEDBACK_KIND_LABELS, FEEDBACK_STATUSES } from './feedback'
import { localPath } from './local-path'
import type { FeedbackKind, FeedbackStatus } from './feedback'
import type { ListSpec } from './list-filters'

// The problem reports and ideas sent from the megaphone (K-134), for the IT Manager to read
// on the site as well as in the daily triage.
const STATUS_WORDS: Record<FeedbackStatus, string> = { NEW: 'New', TRIAGED: 'Triaged', DONE: 'Done', DISMISSED: 'Dismissed' }

export const saysFeedbackKind = (kind: FeedbackKind): string => FEEDBACK_KIND_LABELS[kind]
export const saysFeedbackStatus = (status: FeedbackStatus): string => STATUS_WORDS[status]

export const feedbackList = {
  key: 'feedback-reports',
  search: { placeholder: 'Words in a report, or a page', maxLength: 200 },
  fields: [
    {
      key: 'status',
      label: 'Status',
      kind: 'list',
      column: 'status',
      options: FEEDBACK_STATUSES.map(status => ({ value: status, label: saysFeedbackStatus(status) })),
      operators: ['is', 'any'],
      icon: 'i-lucide-circle-dot',
    },
    {
      key: 'kind',
      label: 'Kind',
      kind: 'list',
      column: 'kind',
      options: FEEDBACK_KINDS.map(kind => ({ value: kind, label: saysFeedbackKind(kind) })),
      operators: ['is'],
      icon: 'i-lucide-megaphone',
    },
  ],
  sort: {
    fields: [{ key: 'createdAt', label: 'Sent', column: 'created_at' }],
    default: 'createdAt',
    direction: 'desc',
  },
} as const satisfies ListSpec

export interface FeedbackRow {
  id: string
  kind: FeedbackKind
  body: string
  pagePath: string
  status: FeedbackStatus
  issueUrl: string | null
  reporterName: string | null
  createdAt: number
}

// Rows written before paths were checked may hold anything, so only a local path or a GitHub issue is linked.
export const linkablePage = (path: string): string | null => localPath(path)

export const linkableIssue = (url: string | null): string | null =>
  url?.startsWith('https://github.com/') ? url : null
