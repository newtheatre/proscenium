import { describe, expect, test } from 'bun:test'
import {
  OPEN_ATTEMPT_STATUSES,
  SUMUP_ATTEMPT_KINDS,
  SUMUP_ATTEMPT_STATUSES,
  attemptIdFromKey,
  attemptMayMove,
  completeAttemptForm,
  isHandheldUserAgent,
  isTerminalAttempt,
  readSumupReturn,
  resolveAttemptForm,
  saysAttemptStatus,
  startAttemptForm,
  sumupLaunchUrl,
  sumupReturnForm,
  sumupReturnWords,
  tillReturnPath,
} from '#shared/utils/sumup'

// F-124's pure half: the URL the SumUp app is opened with, what it sends back, and which
// transitions an attempt may make. Nothing here touches a database.

describe('the launch URL carries what both apps read (F-124 criterion 1)', () => {
  const url = sumupLaunchUrl({
    affiliateKey: 'key-1',
    appId: 'uk.org.newtheatre.unified',
    totalPence: 1234,
    title: 'NNT till',
    attemptId: 'attempt-1',
    returnUrl: 'https://newtheatre.org.uk/pay/return/attempt-1.sig',
  })
  const params = new URL(url.replace('sumupmerchant://', 'https://')).searchParams

  test('opens the SumUp app, not a web page', () => {
    expect(url.startsWith('sumupmerchant://pay/1.0?')).toBe(true)
  })

  test('sends the amount in pounds with a point, under both names the apps read', () => {
    expect(params.get('total')).toBe('12.34')
    expect(params.get('amount')).toBe('12.34')
    expect(params.get('currency')).toBe('GBP')
  })

  test('the attempt id is the foreign transaction id, so the answer names the attempt', () => {
    expect(params.get('foreign-tx-id')).toBe('attempt-1')
  })

  test('every return parameter points at our own URL', () => {
    for (const name of ['callback', 'callbacksuccess', 'callbackfail']) {
      expect(params.get(name)).toBe('https://newtheatre.org.uk/pay/return/attempt-1.sig')
    }
  })

  test('a whole number of pounds still carries its pence', () => {
    const whole = sumupLaunchUrl({ affiliateKey: 'k', appId: 'a', totalPence: 500, title: 't', attemptId: 'x', returnUrl: 'https://x' })
    expect(new URL(whole.replace('sumupmerchant://', 'https://')).searchParams.get('total')).toBe('5.00')
  })
})

describe('what the app sends back is read whatever it did to the query string (criterion 3)', () => {
  test('a plain success', () => {
    const read = readSumupReturn('?smp-status=success&smp-message=Transaction%20successful.&smp-tx-code=ABC123&foreign-tx-id=attempt-1')
    expect(read).toEqual({ smpStatus: 'success', smpMessage: 'Transaction successful.', smpTxCode: 'ABC123', foreignTxId: 'attempt-1' })
    expect(sumupReturnForm.safeParse(read).success).toBe(true)
  })

  test('a failure carries its cause', () => {
    const read = readSumupReturn('?smp-status=failed&smp-failure-cause=transaction-failed&smp-message=Transaction%20failed.')
    expect(sumupReturnForm.parse(read).smpFailureCause).toBe('transaction-failed')
  })

  test('a second question mark appended by the app reads as an ampersand', () => {
    const read = readSumupReturn('?a=1?smp-status=success&smp-tx-code=Z')
    expect(read.smpStatus).toBe('success')
    expect(read.smpTxCode).toBe('Z')
  })

  test('a status the app does not send is refused', () => {
    expect(sumupReturnForm.safeParse({ smpStatus: 'maybe' }).success).toBe(false)
    expect(sumupReturnForm.safeParse({}).success).toBe(false)
  })

  test('the return route takes the signed key alongside the answer', () => {
    const parsed = completeAttemptForm.parse({ smpStatus: 'success', key: 'attempt-1.sig' })
    expect(parsed.key).toBe('attempt-1.sig')
    expect(completeAttemptForm.parse({ smpStatus: 'failed' }).key).toBeNull()
  })
})

describe('an attempt moves only along the paths the story names (criterion 5)', () => {
  test('a started attempt can succeed only through completing', () => {
    expect(attemptMayMove('STARTED', 'COMPLETING')).toBe(true)
    expect(attemptMayMove('STARTED', 'SUCCEEDED')).toBe(false)
  })

  test('a completing attempt succeeds, mismatches, or falls back to started on a lost batch', () => {
    expect(attemptMayMove('COMPLETING', 'SUCCEEDED')).toBe(true)
    expect(attemptMayMove('COMPLETING', 'MISMATCH')).toBe(true)
    expect(attemptMayMove('COMPLETING', 'STARTED')).toBe(true)
    expect(attemptMayMove('COMPLETING', 'FAILED')).toBe(false)
  })

  test('a mismatch is retried by staff or abandoned with a note, never anything else', () => {
    expect(attemptMayMove('MISMATCH', 'COMPLETING')).toBe(true)
    expect(attemptMayMove('MISMATCH', 'ABANDONED')).toBe(true)
    expect(attemptMayMove('MISMATCH', 'SUCCEEDED')).toBe(false)
  })

  test('succeeded, failed and abandoned are final', () => {
    for (const status of ['SUCCEEDED', 'FAILED', 'ABANDONED'] as const) {
      expect(isTerminalAttempt(status)).toBe(true)
      for (const to of SUMUP_ATTEMPT_STATUSES) expect(attemptMayMove(status, to)).toBe(false)
    }
  })

  test('only started and completing block the close; a mismatch is a reconciliation fact (criterion 6)', () => {
    expect([...OPEN_ATTEMPT_STATUSES].sort()).toEqual(['COMPLETING', 'STARTED'])
  })

  test('a staff answer names an outcome, with the code and a note optional', () => {
    expect(resolveAttemptForm.safeParse({ outcome: 'succeeded' }).success).toBe(true)
    expect(resolveAttemptForm.parse({ outcome: 'abandoned', note: 'refunded on the reader' }).note).toBe('refunded on the reader')
    expect(resolveAttemptForm.safeParse({ outcome: 'lost' }).success).toBe(false)
  })
})

// Decision 0096: the typed path is an attempt too, answered by the person at the reader.
describe('a typed charge is an attempt of its own kind (0096)', () => {
  const aBasket = { lines: [{ variantId: 'var-1', qty: 1 }], expectedTotalPence: 250 }

  test('the two kinds are the hand-off and the figure keyed by hand', () => {
    expect([...SUMUP_ATTEMPT_KINDS].sort()).toEqual(['SUMUP', 'TYPED'])
  })

  test('starting one names its kind, and a caller naming none starts a hand-off as before', () => {
    expect(startAttemptForm.parse(aBasket).kind).toBe('SUMUP')
    expect(startAttemptForm.parse({ ...aBasket, kind: 'TYPED' }).kind).toBe('TYPED')
    expect(startAttemptForm.safeParse({ ...aBasket, kind: 'CASH' }).success).toBe(false)
  })

  test('the sale\'s own refusals still hold on the start: an empty basket and ticket money on a tab', () => {
    expect(startAttemptForm.safeParse({ lines: [], expectedTotalPence: 0, kind: 'TYPED' }).success).toBe(false)
    expect(startAttemptForm.safeParse({ lines: [], tickets: [{ reservationId: 'r-1' }], expectedTotalPence: 900, tabHolderId: 'u-1', kind: 'TYPED' }).success).toBe(false)
  })

  test('Card declined is an answer the person at the reader can give', () => {
    expect(resolveAttemptForm.parse({ outcome: 'declined' }).outcome).toBe('declined')
  })

  test('a typed attempt waits for the reader, never for the SumUp app', () => {
    expect(saysAttemptStatus('STARTED', 'TYPED')).not.toContain('SumUp')
    expect(saysAttemptStatus('STARTED', 'TYPED')).toContain('reader')
    expect(saysAttemptStatus('STARTED', 'SUMUP')).toContain('SumUp')
    expect(saysAttemptStatus('FAILED', 'TYPED')).toBe('Card declined')
  })
})

describe('the return page reads the attempt off its own key (criterion 3)', () => {
  test('the id is what sits between the domain and the signature', () => {
    expect(attemptIdFromKey('sumup:abc123.c2lnbmF0dXJl')).toBe('abc123')
    expect(attemptIdFromKey('nonsense')).toBe('nonsense')
  })
})

describe('the SumUp app lives on a handheld (criterion 1)', () => {
  test('a phone is offered the hand-off and a laptop keys the figure', () => {
    expect(isHandheldUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36')).toBe(true)
    expect(isHandheldUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(true)
    expect(isHandheldUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36')).toBe(false)
  })
})

describe('the way back from the SumUp app opens the till at the attempt\'s own bar (criterion 3, issue 1257)', () => {
  test('the venue and the attempt ride the link, so a fresh tab is not asked which bar', () => {
    const path = tillReturnPath('venue-1', 'attempt-1')
    const url = new URL(path, 'https://example.test')
    expect(url.pathname).toBe('/tonight/till')
    expect(url.searchParams.get('venueId')).toBe('venue-1')
    expect(url.searchParams.get('attempt')).toBe('attempt-1')
  })

  test('with nothing known the link is the bare till, which falls back on the device\'s bar', () => {
    expect(tillReturnPath(null, null)).toBe('/tonight/till')
    expect(new URL(tillReturnPath(null, 'attempt-1'), 'https://example.test').searchParams.get('venueId')).toBeNull()
  })
})

describe('the return page says what happened and nothing it cannot know (criterion 5, issue 1257)', () => {
  test('a failure does not claim the basket is already back: another tab may hold it', () => {
    const words = sumupReturnWords({ status: 'FAILED', totalPence: 450, receiptTotalPence: null, error: null })
    expect(words.headline).toBe('Not taken')
    expect(words.detail).toContain('nothing was recorded')
    expect(words.detail).not.toContain('The basket is back')
  })

  test('an abandonment says nothing was recorded and what to do if the reader took the money', () => {
    const words = sumupReturnWords({ status: 'ABANDONED', totalPence: 450, receiptTotalPence: null, error: null })
    expect(words.detail).toContain('nothing was recorded')
    expect(words.detail).toContain('ring it up again')
    expect(words.detail).not.toContain('The basket is back')
  })

  test('a success quotes the recorded figure', () => {
    expect(sumupReturnWords({ status: 'SUCCEEDED', totalPence: 450, receiptTotalPence: 500, error: null }).headline).toBe('Recorded: £5.00')
    expect(sumupReturnWords({ status: 'SUCCEEDED', totalPence: 450, receiptTotalPence: null, error: null }).headline).toBe('Recorded: £4.50')
  })

  test('a mismatch carries the reason and tells the duty manager', () => {
    const words = sumupReturnWords({ status: 'MISMATCH', totalPence: 450, receiptTotalPence: null, error: 'That booking was collected at the desk.' })
    expect(words.detail).toContain('That booking was collected at the desk.')
    expect(words.detail).toContain('duty manager')
  })
})
