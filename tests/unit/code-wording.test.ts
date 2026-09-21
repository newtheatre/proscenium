import { describe, expect, test } from 'bun:test'
import { DRILL_OUTCOMES, saysDrillOutcome } from '#shared/utils/backup'
import { MOVEMENT_SOURCE_TABLES, saysMovementSource } from '#shared/utils/bar'
import { RESERVATION_STATUSES, saysReservationStatus } from '#shared/utils/capacity'
import { AUDIT_ACTION_NAMES, describeAction } from '#shared/utils/audit-actions'
import { FINANCE_SCOPES, saysFinanceScope } from '#shared/utils/finance-reports'
import { LINE_KINDS, describeKind } from '#shared/utils/ledger'
import { CHANNELS, NOTIFICATION_STATUSES, saysChannel, saysNotificationStatus } from '#shared/utils/notifications'
import { ROLES, saysRole } from '#shared/utils/roles'

// K-128 criterion 1, issue 1151 item 8: an enum value is a machine word. Every value a reader can
// reach has wording, and a value added later has none until somebody writes it, which fails here.

const isCode = (said: string): boolean => /^[A-Z0-9_]+$/.test(said)

function everyValueReads(values: readonly string[], says: (value: string) => string): void {
  expect(values.length).toBeGreaterThan(0)
  const unworded = values.filter(value => says(value).trim() === '' || isCode(says(value)))
  expect(unworded).toEqual([])
}

describe('every code a reader can reach has wording (K-128, issue 1151 item 8)', () => {
  test('every role reads as its title', () => {
    everyValueReads(ROLES, saysRole)
    expect(saysRole('FOH_MANAGER')).toBe('Front of House Manager')
  })

  test('every reservation status reads as words', () => {
    everyValueReads(RESERVATION_STATUSES, status => saysReservationStatus(status))
    expect(saysReservationStatus('NO_SHOW')).toBe('No-show')
  })

  test('every send outcome and channel reads as words', () => {
    everyValueReads(NOTIFICATION_STATUSES, status => saysNotificationStatus(status))
    everyValueReads(CHANNELS, channel => saysChannel(channel))
    expect(saysNotificationStatus('SUPPRESSED_PREFERENCE')).toBe('Held back by a preference')
  })

  test('every ledger line kind reads as words', () => {
    everyValueReads(LINE_KINDS.map(kind => kind.name), describeKind)
    expect(describeKind('TICKET_COLLECTION')).toBe('Ticket collection')
  })

  test('every drill outcome reads as words', () => {
    everyValueReads(DRILL_OUTCOMES, outcome => saysDrillOutcome(outcome))
    expect(saysDrillOutcome('PASS')).toBe('Passed')
  })

  test('every finance scope reads as words', () => {
    everyValueReads(FINANCE_SCOPES, scope => saysFinanceScope(scope))
    expect(saysFinanceScope('PERIOD')).toBe('A date range')
  })

  test('every stock movement source table reads as words', () => {
    everyValueReads(MOVEMENT_SOURCE_TABLES, saysMovementSource)
    expect(saysMovementSource('ledger_lines')).toBe('a sale')
    // An unregistered table names nothing rather than showing itself (0027's habit).
    expect(saysMovementSource('stock_movements')).toBe('another record')
  })

  test('every audit action reads as a sentence rather than a dotted code', () => {
    const unworded = AUDIT_ACTION_NAMES.filter(name => describeAction(name).label.includes('.'))
    expect(unworded).toEqual([])
    expect(describeAction('role.granted').label).toBe('Role granted')
  })
})
