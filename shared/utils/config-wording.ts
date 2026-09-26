import { saysMoney } from './bar'
import { isDayOfYearKey } from './config-rules'
import { holdsRoles, isConfigKey } from './config'
import { saysRole } from './roles'
import { plural } from './text'
import { saysMonthDay } from './when'
import type { ConfigKey } from './config'

// What each setting decides, in words, heading its card above the key (issue 1357). Typed over
// every key, so a key added without a heading is a build error.
const HEADINGS: Record<ConfigKey, string> = {
  HOLD_RELEASE_MINUTES_BEFORE: 'Unpaid holds released before curtain',
  HOLD_REMINDER_MINUTES_BEFORE: 'Hold reminder before release',
  HOLD_RELEASE_BATCH_CAP: 'Holds released per run',
  PUBLIC_ORDER_SEAT_CAP: 'Seats per public order',
  WAITING_LIST_OFFER_WINDOW_MINUTES: 'Waiting-list offer stands for',
  WAITING_LIST_OFFER_BATCH_CAP: 'Waiting-list offers per run',
  WAITING_LIST_PURGE_BATCH_CAP: 'Waiting-list entries purged per run',
  REFUND_UNPAID_CANCELLATION_FREE: 'Free cancellation of an unpaid booking',
  REFUND_PAID_REQUIRES_MANAGER: 'A paid refund needs a manager',
  LISTING_LIMITED_THRESHOLD_PERCENT: 'Tickets shown as limited below',
  COMP_REQUEST_EXPIRY_MINUTES: 'Comp request lapses after',
  SUMUP_ATTEMPT_TIMEOUT_MINUTES: 'Unanswered card charge abandoned after',
  RESERVATION_RESEND_ATTEMPTS: 'Confirmation resends per window',
  RESERVATION_RESEND_WINDOW_MINUTES: 'Confirmation resend window',
  ACCESS_PROFILE_VALIDITY_MONTHS: 'Access profile stays current for',
  PASS_REQUEST_EXPIRE_BATCH_CAP: 'Pass requests expired per run',
  BAR_TAB_CAP_PENCE: 'Bar tab cap',
  BAR_TAB_CAP_MANAGER_OVERRIDE: 'A manager may raise the tab cap',
  BAR_DISCOUNT_MAX_PERCENT: 'Largest bar discount',
  BAR_AUTHORISED_TAB_HOLDERS: 'People who may run a tab',
  BAR_AUTHORISED_TAB_ROLES: 'Roles that may run a tab',
  DISCOUNT_CODES_ENABLED: 'Discount codes',
  YEAR_START: 'Year opens on',
  YEAR_END: 'Year closes on',

  ROOM_MIN_BOOKING_MINUTES: 'Shortest room booking',
  ROOM_MAX_BOOKING_HOURS: 'Longest room booking',
  ROOM_MAX_BOOKING_ADMINS_EXEMPT: 'Administrators may book past the longest',
  ROOM_AUTO_APPROVE_NOTICE_HOURS: 'Notice for automatic approval',
  ROOM_BOOKING_HORIZON_WEEKS: 'How far ahead a room can be booked',
  ROOM_ACTIVE_BOOKINGS_PER_MEMBER: 'Room bookings one member may hold',
  ROOM_SERIES_MAX_OCCURRENCES: 'Bookings in one series',
  ROOM_NO_SHOW_WINDOW_DAYS: 'No-shows counted over',
  ROOM_NO_SHOW_RECORD_AT: 'No-shows before a formal record',
  ROOM_NO_SHOW_PREAPPROVAL_AT: 'No-shows before pre-approval',
  ROOM_REQUEST_ESCALATE_HOURS: 'Room request chased after',
  ROOM_REQUEST_EXPIRE_HOURS: 'Room request lapses after',
  ROOM_FEED_WEEKS: 'Calendar feed reaches ahead',
  ROOM_AVAILABILITY_ROW_BOUND: 'Bookings one availability check covers',
  EXTERNAL_REQUEST_NOTICE_WORKING_DAYS: 'Notice for a room we do not manage',
  BANK_HOLIDAYS: 'Bank holidays',
  ROOM_PURPOSES: 'What a room is booked for',
  ROOM_PRIORITY_TIERS: 'Booking priority',
  TRAINING_EXPIRY_WARNING_DAYS: 'First training expiry warning',
  TRAINING_FINAL_WARNING_DAYS: 'Final training expiry warning',
  TRAINING_SWEEP_ARMED: 'Training expiry warnings sent',
  TRAINING_LEDGER_MONTHS: 'Training warnings kept for',
  TRAINING_CARRY_OVER_DAYS: 'Training carry-over',
  ACADEMIC_YEAR_BOUNDARY: 'Academic year turns over on',
  SESSION_SIGNUP_CLOSES_HOURS: 'Session sign-up closes before',
  SESSION_EDIT_WINDOW_DAYS: 'Register stays editable for',
  REGISTER_NAG_START_DAY: 'Register reminders start after',
  REGISTER_NAG_CADENCE_DAYS: 'Register reminders every',
  REGISTER_NAG_STOP_DAYS: 'Register reminders stop after',
  SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE: 'Training for a duty manager shift',
  SHIFT_ELIGIBILITY_DOOR_MODULE: 'Training for a door shift',
  SHIFT_ELIGIBILITY_BAR_MODULE: 'Training for a bar shift',
  SHIFT_CLAIM_AUTO_CONFIRM: 'A claimed shift is confirmed at once',
  SHIFT_RELEASE_NOTICE_HOURS: 'A released shift is told at once within',
  SHIFT_START_BEFORE_DOORS_MINUTES: 'Shift starts before doors',
  SHIFT_END_AFTER_CURTAIN_DOWN_MINUTES: 'Shift ends after curtain down',
  SHIFT_AUTHORITY_GRACE_MINUTES: 'Show-night screens open outside a shift for',

  PASSWORD_MIN_LENGTH: 'Shortest password',
  PASSWORD_MAX_LENGTH: 'Longest password',
  PASSWORD_REQUIRE_MIXED_CASE: 'A password needs upper and lower case',
  PASSWORD_REQUIRE_NUMBER: 'A password needs a digit',
  PASSWORD_REQUIRE_SYMBOL: 'A password needs a symbol',
  PASSWORD_RESET_HOURS: 'Password reset link lasts',
  ADMIN_TOKEN_HOURS: 'Link sent by an administrator lasts',
  MAGIC_LINK_MINUTES: 'Sign-in link lasts',
  MFA_ATTEMPT_MINUTES: 'Second factor awaited for',
  REAUTH_WINDOW_MINUTES: 'A proven sign-in stays fresh for',
  PRIVILEGED_ROLES: 'Roles that need a second factor',
  SIGN_IN_ATTEMPTS_PER_ACCOUNT: 'Sign-in attempts per window',
  SIGN_IN_ATTEMPTS_PER_ADDRESS_WINDOW_MINUTES: 'Sign-in attempt window',
  VERIFY_RESEND_ATTEMPTS: 'Verification resends per window',
  VERIFY_RESEND_WINDOW_MINUTES: 'Verification resend window',
  MEMBERSHIP_GRACE_DAYS: 'Membership grace',
  MEMBERSHIP_FEE_PENCE: 'Membership fee',
  MEMBERSHIP_PURCHASE_URL: 'Where a membership is bought',
  MEMBERSHIP_RENEWAL_NOTICE_DAYS: 'Membership renewal reminder',
  ROLE_LAPSE_NOTICE_DAYS: 'Role lapse warning',
  ROLE_GRANT_PRUNE_DAYS: 'Lapsed roles tidied away after',
  UNVERIFIED_ACCOUNT_DAYS: 'Unproven address anonymised after',
  UNVERIFIED_EXPIRY_CAP: 'Unproven accounts anonymised per run',
  NOTIFICATION_EMAIL_DEFAULT_TOPICS: 'Email topics a new account starts with',
  NOTIFICATION_MAX_ATTEMPTS: 'Send attempts per message',
  NOTIFICATION_RETRY_BACKOFF_MINUTES: 'First retry after',
  NOTIFICATION_LOG_RETENTION_MONTHS: 'Send log kept for',
  NOTIFICATION_PUSH_DEFAULT_TOPICS: 'Push topics a new account starts with',
  NOTIFICATION_DIGEST_WINDOW_BOOKINGS_MINUTES: 'Bookings email held for',
  NOTIFICATION_DIGEST_WINDOW_SHIFTS_MINUTES: 'Shifts email held for',
  NOTIFICATION_DIGEST_WINDOW_TRAINING_MINUTES: 'Training email held for',
  NOTIFICATION_DIGEST_WINDOW_ROOMS_MINUTES: 'Rooms email held for',
  NOTIFICATION_DIGEST_WINDOW_ANNOUNCEMENTS_MINUTES: 'Announcements email held for',
  RETENTION_FULL_ACCOUNT_YEARS: 'Inactive account anonymised after',
  RETENTION_GUEST_YEARS: 'Inactive guest anonymised after',
  RETENTION_ARMED: 'Retention armed',
  RETENTION_WARNING_DAYS: 'First retention warning',
  RETENTION_FINAL_WARNING_DAYS: 'Final retention warning',
  RETENTION_SWEEP_CAP: 'Accounts anonymised per retention run',
  RETENTION_WARNING_CAP: 'Retention warnings per run',
  BACKUP_DRILL_INTERVAL_DAYS: 'Restore drill due every',
  HEALTH_ALERT_WINDOW_MINUTES: 'Unhealthy before the IT Manager is told',
  NIGHT_REPORT_RECIPIENTS: 'Night report recipients',
}

export function configHeading(key: string): string {
  return isConfigKey(key) ? HEADINGS[key] : key
}

// The key names its unit, so the unit is read from it rather than kept twice. Money is not a
// unit here: a pence key is shown in pounds.
const UNITS: [RegExp, string, string][] = [
  [/(?:^|_)WORKING_DAYS(?:_|$)/, 'working day', 'working days'],
  [/(?:^|_)MINUTES(?:_|$)/, 'minute', 'minutes'],
  [/(?:^|_)HOURS(?:_|$)/, 'hour', 'hours'],
  [/(?:^|_)DAYS?(?:_|$)/, 'day', 'days'],
  [/(?:^|_)WEEKS(?:_|$)/, 'week', 'weeks'],
  [/(?:^|_)MONTHS(?:_|$)/, 'month', 'months'],
  [/(?:^|_)YEARS(?:_|$)/, 'year', 'years'],
]

function unitOf(key: string): { one: string, many: string } | 'percent' | null {
  if (/_PERCENT$/.test(key)) return 'percent'
  const found = UNITS.find(([pattern]) => pattern.test(key))
  return found ? { one: found[1], many: found[2] } : null
}

export function configUnit(key: string): string | null {
  const unit = unitOf(key)
  if (unit === 'percent') return '%'
  return unit ? unit.many : null
}

// A value in words for somebody who reads the settings and changes none. A key holding people is
// named by the screen, which alone is told the names.
export function saysConfigValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Not set'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'number') {
    if (key.endsWith('_PENCE')) return saysMoney(value)
    const unit = unitOf(key)
    if (unit === 'percent') return `${value}%`
    return unit ? plural(value, unit.one, unit.many) : String(value)
  }
  if (Array.isArray(value)) {
    if (!value.length) return 'None'
    return value.map(item => (holdsRoles(key) ? saysRole(String(item)) : String(item))).join(', ')
  }
  if (typeof value === 'string' && isDayOfYearKey(key)) return saysMonthDay(value)
  return String(value)
}
