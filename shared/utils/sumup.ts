import { saysMoney } from './bar'
import { z } from 'zod'

// The hand-off of a basket to the SumUp app and what comes back (F-124, 0069). Pure: the URL the
// app is opened with, the query it returns, and which attempt transitions are allowed.

export const SUMUP_ATTEMPT_STATUSES = ['STARTED', 'COMPLETING', 'SUCCEEDED', 'FAILED', 'ABANDONED', 'MISMATCH'] as const
export type SumupAttemptStatus = (typeof SUMUP_ATTEMPT_STATUSES)[number]

export const SUMUP_RESOLUTIONS = ['CALLBACK', 'KEY', 'STAFF', 'SWEEP'] as const
export type SumupResolution = (typeof SUMUP_RESOLUTIONS)[number]

// An attempt still waiting for an answer, or one the answer could not be posted for: the two the
// till lists, and the first of which blocks the close (criterion 6).
export const OPEN_ATTEMPT_STATUSES: readonly SumupAttemptStatus[] = ['STARTED', 'COMPLETING']
export const UNRESOLVED_ATTEMPT_STATUSES: readonly SumupAttemptStatus[] = ['STARTED', 'COMPLETING', 'MISMATCH']

// A completion the batch never finished: technical, not a policy number, so it is not a
// configuration key (criterion 5).
export const SUMUP_STUCK_COMPLETING_MINUTES = 10

// The return leg lands here, the key in the path so the app's own `?smp-...` cannot collide.
export const SUMUP_RETURN_PATH = '/pay/return'

// The key is a booking-style token over `sumup:<attempt id>`, so the id it names can be read
// off it before the server has verified anything, for the page to address its call.
export const ATTEMPT_KEY_DOMAIN = 'sumup:'

export function attemptIdFromKey(key: string): string {
  return key.replace(ATTEMPT_KEY_DOMAIN, '').split('.')[0] ?? ''
}

export const SUMUP_STATUSES = ['success', 'failed', 'invalidstate'] as const
export const SUMUP_FAILURE_CAUSES = ['transaction-failed', 'geolocation-required', 'invalid-param', 'invalid-token'] as const

export interface SumupLaunch {
  affiliateKey: string
  appId: string
  totalPence: number
  title: string
  attemptId: string
  returnUrl: string
}

// `total` for the current Android app, `amount` for iOS and older Android; `callback` for
// Android, `callbacksuccess` and `callbackfail` for iOS. Sending all of them costs nothing.
export function sumupLaunchUrl(launch: SumupLaunch): string {
  const amount = (launch.totalPence / 100).toFixed(2)
  const params = new URLSearchParams({
    'affiliate-key': launch.affiliateKey,
    'app-id': launch.appId,
    'total': amount,
    'amount': amount,
    'currency': 'GBP',
    'title': launch.title,
    'foreign-tx-id': launch.attemptId,
    'skip-screen-success': 'true',
    'callback': launch.returnUrl,
    'callbacksuccess': launch.returnUrl,
    'callbackfail': launch.returnUrl,
  })
  return `sumupmerchant://pay/1.0?${params.toString()}`
}

// What the SumUp app appends to the return URL. Everything optional but the status: an older
// app omits the code, and a failure omits nothing we depend on.
export const sumupReturnForm = z.object({
  smpStatus: z.enum(SUMUP_STATUSES),
  smpMessage: z.string().trim().max(500).nullish().transform(value => value ?? null),
  smpTxCode: z.string().trim().max(100).nullish().transform(value => value ?? null),
  smpFailureCause: z.string().trim().max(100).nullish().transform(value => value ?? null),
  foreignTxId: z.string().trim().max(128).nullish().transform(value => value ?? null),
})

export type SumupReturnInput = z.output<typeof sumupReturnForm>

// The app may append its query to a URL that already carries one, so a second `?` reads as `&`.
export function readSumupReturn(search: string): Record<string, string> {
  const params = new URLSearchParams(search.replace(/^\?/, '').replaceAll('?', '&'))
  const read = (name: string): string | undefined => params.get(name) ?? undefined
  const out: Record<string, string> = {}
  const status = read('smp-status')
  if (status) out.smpStatus = status
  const message = read('smp-message')
  if (message) out.smpMessage = message
  const code = read('smp-tx-code')
  if (code) out.smpTxCode = code
  const cause = read('smp-failure-cause')
  if (cause) out.smpFailureCause = cause
  const foreign = read('foreign-tx-id')
  if (foreign) out.foreignTxId = foreign
  return out
}

// What the return route accepts: the app's answer, plus the signed key when the browser holds no
// session (criterion 3).
export const completeAttemptForm = sumupReturnForm.extend({
  key: z.string().trim().max(400).nullish().transform(value => value ?? null),
})

export type CompleteAttemptInput = z.output<typeof completeAttemptForm>

// Staff answering "did it go through?" (criterion 5). A mismatch abandoned needs a note, since
// the reader has money the ledger does not and somebody has to say what happened to it.
export const resolveAttemptForm = z.object({
  outcome: z.enum(['succeeded', 'abandoned']),
  smpTxCode: z.string().trim().max(100).nullish().transform(value => value ?? null),
  note: z.string().trim().max(500).nullish().transform(value => value ?? null),
})

export type ResolveAttemptInput = z.output<typeof resolveAttemptForm>

// Every transition an attempt may make, and by whom (criterion 5). Anything not here is refused,
// so a callback and a staff answer cannot both advance one row.
const TRANSITIONS: Record<SumupAttemptStatus, SumupAttemptStatus[]> = {
  STARTED: ['COMPLETING', 'FAILED', 'ABANDONED'],
  COMPLETING: ['SUCCEEDED', 'MISMATCH', 'STARTED'],
  MISMATCH: ['COMPLETING', 'ABANDONED'],
  SUCCEEDED: [],
  FAILED: [],
  ABANDONED: [],
}

export function attemptMayMove(from: SumupAttemptStatus, to: SumupAttemptStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function isTerminalAttempt(status: SumupAttemptStatus): boolean {
  return TRANSITIONS[status].length === 0
}

// The SumUp app lives on a phone or a tablet; the counter laptop keys the figure by hand.
export function isHandheldUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
}

// The shape the till holds while an attempt is in flight and the list of tonight's open ones read.
export interface SumupAttemptView {
  id: string
  status: SumupAttemptStatus
  createdAt: number
  createdByName: string | null
  expectedTotalPence: number
  smpTxCode: string | null
  smpMessage: string | null
  smpFailureCause: string | null
  error: string | null
  entryId: string | null
  resolution: SumupResolution | null
}

export function saysAttemptStatus(status: SumupAttemptStatus): string {
  switch (status) {
    case 'STARTED': return 'Waiting for the SumUp app'
    case 'COMPLETING': return 'Recording the sale'
    case 'SUCCEEDED': return 'Recorded'
    case 'FAILED': return 'Not taken'
    case 'ABANDONED': return 'Abandoned'
    case 'MISMATCH': return 'Taken on the reader, not recorded'
  }
}

// Where the return page's way back goes: the attempt's own bar, and the attempt, because the app
// may return in a fresh tab that holds neither (issue 1257).
export function tillReturnPath(venueId: string | null, attemptId: string | null): string {
  const query = new URLSearchParams()
  if (venueId) query.set('venueId', venueId)
  if (attemptId) query.set('attempt', attemptId)
  const search = query.toString()
  return search ? `/tonight/till?${search}` : '/tonight/till'
}

export interface SumupReturnAnswer {
  status: SumupAttemptStatus
  totalPence: number
  receiptTotalPence: number | null
  error: string | null
}

// The return page runs in whichever tab the app opened, so it never says where the basket is now.
export function sumupReturnWords(answer: SumupReturnAnswer): { headline: string, detail: string } {
  switch (answer.status) {
    case 'SUCCEEDED': return { headline: `Recorded: ${saysMoney(answer.receiptTotalPence ?? answer.totalPence)}`, detail: 'The till has it. Close this page.' }
    case 'FAILED': return { headline: 'Not taken', detail: 'SumUp says the payment did not go through, so nothing was recorded. The till brings the basket back on this phone.' }
    case 'ABANDONED': return { headline: 'Already given up on', detail: 'This hand-off was given up on before SumUp answered, so nothing was recorded. If the reader took the money, ring it up again on the till.' }
    case 'MISMATCH': return { headline: 'Taken on the reader, not recorded', detail: `${answer.error ?? 'The sale was not recorded.'} Tell the duty manager: the reader took this money and the till has no record of it.` }
    default: return { headline: saysAttemptStatus(answer.status), detail: 'The till is recording it.' }
  }
}
