import { z } from 'zod'

// Every operational rule with a number in it is a validated key enforced at the write path
// (0012). Defaults live here; a missing `config` row means the default.

// Values ship as the proposed column of docs/workshops.md until a workshop amends them,
// which is a settings change and not a release (0019).
export type ConfigWorkshop = 'money-and-box-office' | 'spaces-and-training' | 'people-and-communications'

interface ConfigKeyDefinition {
  schema: z.ZodType
  // Absent means the workshop register proposed no value: the key ships unset and the
  // features needing it are blocked rather than guessing (0019).
  default?: unknown
  workshop: ConfigWorkshop
  describes: string
  // A value that can hold personal data. Its changes are audited as a hash rather than as the
  // value, because audit detail carries identifiers and never people (0011, 0024).
  sensitive?: true
}

export const CONFIG_KEYS = {
  HOLD_RELEASE_MINUTES_BEFORE: {
    schema: z.number().int().positive(),
    default: 15,
    workshop: 'money-and-box-office',
    describes: 'Minutes before curtain that an unpaid reservation hold is released. Per-show override allowed.',
  },
  PUBLIC_ORDER_SEAT_CAP: {
    schema: z.number().int().positive(),
    default: 10,
    workshop: 'money-and-box-office',
    describes: 'Seats one public order may hold. The box office is uncapped.',
  },
  REFUND_UNPAID_CANCELLATION_FREE: {
    schema: z.boolean(),
    default: true,
    workshop: 'money-and-box-office',
    describes: 'Whether a customer may cancel an unpaid booking themselves at no charge.',
  },
  REFUND_PAID_REQUIRES_MANAGER: {
    schema: z.boolean(),
    default: true,
    workshop: 'money-and-box-office',
    describes: 'Whether refunding a paid booking needs manager approval. Money moves in person only (0005).',
  },
  COMP_REQUEST_EXPIRY_MINUTES: {
    schema: z.number().int().positive(),
    default: 10,
    workshop: 'money-and-box-office',
    describes: 'Minutes a comp request stays open before it lapses.',
  },
  BAR_TAB_CAP_PENCE: {
    schema: z.number().int().nonnegative(),
    default: 2000,
    workshop: 'money-and-box-office',
    describes: 'Hard cap on an open bar tab, in pence. The old soft cap nagged and never blocked.',
  },
  BAR_TAB_CAP_MANAGER_OVERRIDE: {
    schema: z.boolean(),
    default: true,
    workshop: 'money-and-box-office',
    describes: 'Whether a manager may raise the tab cap for one tab.',
  },
  DISCOUNT_CODES_ENABLED: {
    schema: z.boolean(),
    default: false,
    workshop: 'money-and-box-office',
    describes: 'Discount codes exist as a capability and stay off until the committee wants them.',
  },
  SEASON_START: {
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    default: '08-01',
    workshop: 'money-and-box-office',
    describes: 'Month and day the season opens, London. Drives reporting and role expiry (0009).',
  },
  SEASON_END: {
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    default: '07-31',
    workshop: 'money-and-box-office',
    describes: 'Month and day the season closes, London. Roles expire at the last London instant of it.',
  },

  ROOM_MIN_BOOKING_MINUTES: {
    schema: z.number().int().positive(),
    default: 30,
    workshop: 'spaces-and-training',
    describes: 'Shortest bookable slot.',
  },
  ROOM_MAX_BOOKING_HOURS: {
    schema: z.number().positive(),
    default: 4,
    workshop: 'spaces-and-training',
    describes: 'Longest bookable slot for an ordinary member.',
  },
  ROOM_MAX_BOOKING_ADMINS_EXEMPT: {
    schema: z.boolean(),
    default: true,
    workshop: 'spaces-and-training',
    describes: 'Whether administrators may book past the maximum.',
  },
  ROOM_AUTO_APPROVE_NOTICE_HOURS: {
    schema: z.number().int().nonnegative(),
    default: 48,
    workshop: 'spaces-and-training',
    describes: 'Notice below which a request goes to the approval queue instead of auto-approving.',
  },
  ROOM_BOOKING_HORIZON_WEEKS: {
    schema: z.number().int().positive(),
    default: 12,
    workshop: 'spaces-and-training',
    describes: 'How many weeks ahead a member may book. Weeks, not end of term: no term dates exist (0034).',
  },
  ROOM_ACTIVE_BOOKINGS_PER_MEMBER: {
    schema: z.number().int().positive(),
    default: 10,
    workshop: 'spaces-and-training',
    describes: 'Active bookings one member may hold. A series counts each occurrence.',
  },
  ROOM_SERIES_MAX_OCCURRENCES: {
    schema: z.number().int().positive(),
    default: 12,
    workshop: 'spaces-and-training',
    describes: 'Occurrences in one recurring series. The old UI and API disagreed at 12 and 52.',
  },
  ROOM_NO_SHOW_WINDOW_DAYS: {
    schema: z.number().int().positive(),
    default: 365,
    workshop: 'spaces-and-training',
    describes: 'How far back the no-show ladder looks. It also clears at the committee year end, whichever is shorter.',
  },
  ROOM_NO_SHOW_RECORD_AT: {
    schema: z.number().int().positive(),
    default: 2,
    workshop: 'spaces-and-training',
    describes: 'No-shows within the window above before the member is formally recorded.',
  },
  ROOM_NO_SHOW_PREAPPROVAL_AT: {
    schema: z.number().int().positive(),
    default: 3,
    workshop: 'spaces-and-training',
    describes: 'No-shows within the window above before every further booking needs pre-approval.',
  },
  ROOM_REQUEST_ESCALATE_HOURS: {
    schema: z.number().int().positive(),
    default: 48,
    workshop: 'spaces-and-training',
    describes: 'How long a request may wait before the approvers are told it is waiting.',
  },
  ROOM_REQUEST_EXPIRE_HOURS: {
    schema: z.number().int().positive(),
    default: 168,
    workshop: 'spaces-and-training',
    describes: 'How long a request may wait before it lapses and the member is told.',
  },
  ROOM_FEED_WEEKS: {
    schema: z.number().int().positive(),
    default: 26,
    workshop: 'spaces-and-training',
    describes: 'How far ahead a personal calendar feed carries bookings.',
  },
  ROOM_AVAILABILITY_ROW_BOUND: {
    schema: z.number().int().positive(),
    default: 1000,
    workshop: 'spaces-and-training',
    describes: 'Bookings an availability sweep may cover before it refuses. It refuses, never truncates.',
  },
  EXTERNAL_REQUEST_NOTICE_WORKING_DAYS: {
    schema: z.number().int().positive(),
    default: 3,
    workshop: 'spaces-and-training',
    describes: 'Working days needed before a room we do not manage is wanted. Weekends and bank holidays do not count; the booking itself may still fall on one.',
  },
  BANK_HOLIDAYS: {
    schema: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    default: [
      '2026-12-25', '2026-12-28',
      '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30',
      '2027-12-27', '2027-12-28',
      '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28',
      '2028-12-25', '2028-12-26',
    ],
    workshop: 'spaces-and-training',
    describes: 'Days that do not count towards notice, as published for England and Wales. A request is refused rather than judged once this list stops reaching far enough ahead.',
  },
  ROOM_PURPOSES: {
    schema: z.array(z.string()).nonempty(),
    default: ['REHEARSAL', 'MEETING', 'WORKSHOP', 'AUDITION', 'READ_THROUGH', 'GET_IN', 'SOCIAL', 'STORAGE'],
    workshop: 'spaces-and-training',
    describes: 'What a room may be booked for. A space unsuitable for one of these is noted against it.',
  },
  ROOM_PRIORITY_TIERS: {
    schema: z.array(z.string()).nonempty(),
    default: ['PRODUCTION', 'COMMITTEE', 'REHEARSAL', 'GENERAL'],
    workshop: 'spaces-and-training',
    describes: 'Booking priority, highest first. A higher tier bumps a lower one with notification.',
  },
  TRAINING_EXPIRY_WARNING_DAYS: {
    schema: z.number().int().positive(),
    default: 60,
    workshop: 'spaces-and-training',
    describes: 'Days before a training record expires that its first warning is sent.',
  },
  TRAINING_FINAL_WARNING_DAYS: {
    schema: z.number().int().positive(),
    default: 14,
    workshop: 'spaces-and-training',
    describes: 'Days before expiry that the final warning is sent.',
  },
  TRAINING_SWEEP_ARMED: {
    // Ships disarmed: the sweep computes and reports what it would send until somebody turns it
    // on deliberately, and turning it on is audited (G-125 criterion 4).
    schema: z.boolean(),
    default: false,
    workshop: 'spaces-and-training',
    describes: 'Whether the training expiry sweep sends what it finds, or only reports it.',
  },
  TRAINING_LEDGER_MONTHS: {
    schema: z.number().int().positive().max(120),
    default: 24,
    workshop: 'spaces-and-training',
    describes: 'How long a sent notification stays in the ledger before the sweep prunes it.',
  },
  TRAINING_CARRY_OVER_DAYS: {
    // Under a year, because the carry-over rolls the boundary once: a window longer than the year
    // it carries across could not do what it says (G-123 criterion 2).
    schema: z.number().int().positive().max(364),
    default: 60,
    workshop: 'spaces-and-training',
    describes: 'Carry-over window across the academic year boundary. A constant in the old module.',
  },
  ACADEMIC_YEAR_BOUNDARY: {
    // Shape only: which MM-DD values are real days is config-rules' DAY_OF_YEAR_KEYS, whose
    // refusal names the rule rather than the key (G-123 criterion 5, J-104 criterion 3).
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    default: '09-30',
    workshop: 'spaces-and-training',
    describes: 'Month and day the academic year turns over, London. Distinct from the season boundary.',
  },
  SESSION_EDIT_WINDOW_DAYS: {
    schema: z.number().int().positive(),
    default: 14,
    workshop: 'spaces-and-training',
    describes: 'Days after a training session that its register stays editable.',
  },
  REGISTER_NAG_START_DAY: {
    schema: z.number().int().positive(),
    default: 2,
    workshop: 'spaces-and-training',
    describes: 'Days after a session with an unmarked register before nagging starts.',
  },
  REGISTER_NAG_CADENCE_DAYS: {
    schema: z.number().int().positive(),
    default: 7,
    workshop: 'spaces-and-training',
    describes: 'Days between nags for an unmarked register.',
  },
  REGISTER_NAG_STOP_DAYS: {
    schema: z.number().int().positive(),
    default: 60,
    workshop: 'spaces-and-training',
    describes: 'Days after a session that nagging stops.',
  },
  PRACTICE_WINDOW_GRACE_HOURS: {
    schema: z.number().positive(),
    default: 4,
    workshop: 'spaces-and-training',
    describes: 'Grace on a practice window before it lapses. The old documents flagged this as a guess.',
  },

  PASSWORD_MIN_LENGTH: {
    schema: z.number().int().min(8).max(64),
    default: 15,
    workshop: 'people-and-communications',
    describes: 'Shortest accepted password. NIST SP 800-63B rev 4 asks for 15 where a password can be the only authenticator, which it is until MFA is compulsory.',
  },
  PASSWORD_MAX_LENGTH: {
    schema: z.number().int().min(64).max(256),
    default: 128,
    workshop: 'people-and-communications',
    describes: 'Longest accepted password. A cap exists because hashing is deliberately expensive: without one, a very long password is a cheap way to make the worker do work. OWASP ASVS 2.1.2 puts it at 128.',
  },
  PASSWORD_REQUIRE_MIXED_CASE: {
    schema: z.boolean(),
    default: false,
    workshop: 'people-and-communications',
    describes: 'Require upper and lower case. Off: composition rules push people towards Password1! and a sticky note, and NIST advises against them.',
  },
  PASSWORD_REQUIRE_NUMBER: {
    schema: z.boolean(),
    default: false,
    workshop: 'people-and-communications',
    describes: 'Require a digit. Off, for the same reason as mixed case.',
  },
  PASSWORD_REQUIRE_SYMBOL: {
    schema: z.boolean(),
    default: false,
    workshop: 'people-and-communications',
    describes: 'Require a symbol. Off, for the same reason as mixed case.',
  },

  PASSWORD_RESET_HOURS: {
    schema: z.number().positive(),
    default: 1,
    workshop: 'people-and-communications',
    describes: 'How long a self-service password reset link lasts. The message states the real figure, whatever this is set to.',
  },
  ADMIN_TOKEN_HOURS: {
    schema: z.number().positive(),
    default: 24,
    workshop: 'people-and-communications',
    describes: 'How long an administrator-initiated or guest-claim link lasts, which is longer because the holder may not be expecting it.',
  },
  MAGIC_LINK_MINUTES: {
    schema: z.number().int().positive(),
    default: 15,
    workshop: 'people-and-communications',
    describes: 'How long a sign-in link lasts. Short, because it is a credential sitting in a mailbox.',
  },

  MFA_ATTEMPT_MINUTES: {
    schema: z.number().int().positive(),
    default: 5,
    workshop: 'people-and-communications',
    describes: 'How long a proven password step waits for its second factor before the person starts again.',
  },
  PRIVILEGED_ROLES: {
    schema: z.array(z.string()),
    default: ['ADMIN', 'MANAGER', 'THEATRE_MANAGER', 'TRAINING_MANAGER'],
    workshop: 'people-and-communications',
    describes: 'Roles that require a second factor: any role touching money, personal data or safety records (A-112). Changing this is audited.',
  },

  SIGN_IN_ATTEMPTS_PER_ACCOUNT: {
    schema: z.number().int().positive(),
    default: 10,
    workshop: 'people-and-communications',
    describes: 'Sign-in attempts allowed per address per window. Counted on the address submitted, not the account found, so being limited never proves one exists.',
  },
  SIGN_IN_ATTEMPTS_PER_ADDRESS_WINDOW_MINUTES: {
    schema: z.number().int().positive(),
    default: 15,
    workshop: 'people-and-communications',
    describes: 'The window sign-in attempts are counted over.',
  },
  VERIFY_RESEND_ATTEMPTS: {
    schema: z.number().int().positive(),
    default: 5,
    workshop: 'people-and-communications',
    describes: 'Verification resends allowed per address per window, so nobody can flood a mailbox.',
  },
  VERIFY_RESEND_WINDOW_MINUTES: {
    schema: z.number().int().positive(),
    default: 60,
    workshop: 'people-and-communications',
    describes: 'The window verification resends are counted over.',
  },

  MEMBERSHIP_GRACE_DAYS: {
    schema: z.number().int().nonnegative(),
    default: 14,
    workshop: 'people-and-communications',
    describes: 'Days after a membership expires that it still counts, so a renewal in hand is not a refusal at the desk (0031).',
  },
  MEMBERSHIP_RENEWAL_NOTICE_DAYS: {
    schema: z.number().int().positive(),
    default: 21,
    workshop: 'people-and-communications',
    describes: 'How far ahead of its own expiry a membership is reminded. Each person has their own date, so this is not a year-end chase.',
  },

  UNVERIFIED_ACCOUNT_DAYS: {
    schema: z.number().int().positive(),
    default: 30,
    workshop: 'people-and-communications',
    describes: 'Days an account may hold an unproven address before it is anonymised. A password-less account is exempt: it was never a registration to complete (0026).',
  },
  UNVERIFIED_EXPIRY_CAP: {
    schema: z.number().int().positive(),
    default: 200,
    workshop: 'people-and-communications',
    describes: 'The most accounts one unverified-expiry run may anonymise, so the first sweep after an import drains over days (0026).',
  },

  RETENTION_FULL_ACCOUNT_YEARS: {
    schema: z.number().int().positive(),
    default: 2,
    workshop: 'people-and-communications',
    describes: 'Years of inactivity before a full account is anonymised (0011).',
  },
  RETENTION_GUEST_YEARS: {
    schema: z.number().int().positive(),
    default: 3,
    workshop: 'people-and-communications',
    describes: 'Years of inactivity before a guest record is anonymised (0011).',
  },
  RETENTION_ARMED: {
    schema: z.boolean(),
    default: false,
    workshop: 'people-and-communications',
    describes: 'Retention ships as a dry-run and is armed by typed confirmation, in December.',
  },
  NIGHT_REPORT_RECIPIENTS: {
    schema: z.array(z.string().email()),
    workshop: 'people-and-communications',
    sensitive: true,
    describes: 'Standing recipients of the end-of-night report. The list is confirmed in the workshop.',
  },
} as const satisfies Record<string, ConfigKeyDefinition>

export type ConfigKey = keyof typeof CONFIG_KEYS

export const CONFIG_KEY_NAMES = Object.keys(CONFIG_KEYS) as ConfigKey[]

export function isConfigKey(name: string): name is ConfigKey {
  return Object.hasOwn(CONFIG_KEYS, name)
}

// The keys something actually reads today; a key absent here is recorded but not yet enforced,
// which the surface says plainly (0012). A test greps the server for the reads, so it cannot drift.
export const ENFORCED_KEYS = [
  'ACADEMIC_YEAR_BOUNDARY',
  'ADMIN_TOKEN_HOURS',
  'MAGIC_LINK_MINUTES',
  'MFA_ATTEMPT_MINUTES',
  'PASSWORD_MAX_LENGTH',
  'PASSWORD_MIN_LENGTH',
  'PASSWORD_REQUIRE_MIXED_CASE',
  'PASSWORD_REQUIRE_NUMBER',
  'PASSWORD_REQUIRE_SYMBOL',
  'PASSWORD_RESET_HOURS',
  'MEMBERSHIP_GRACE_DAYS',
  'ROOM_ACTIVE_BOOKINGS_PER_MEMBER',
  'ROOM_AVAILABILITY_ROW_BOUND',
  'ROOM_FEED_WEEKS',
  'ROOM_REQUEST_ESCALATE_HOURS',
  'ROOM_REQUEST_EXPIRE_HOURS',
  'ROOM_AUTO_APPROVE_NOTICE_HOURS',
  'ROOM_BOOKING_HORIZON_WEEKS',
  'ROOM_MAX_BOOKING_ADMINS_EXEMPT',
  'ROOM_MAX_BOOKING_HOURS',
  'ROOM_MIN_BOOKING_MINUTES',
  'ROOM_SERIES_MAX_OCCURRENCES',
  'ROOM_PRIORITY_TIERS',
  'ROOM_PURPOSES',
  'EXTERNAL_REQUEST_NOTICE_WORKING_DAYS',
  'BANK_HOLIDAYS',
  'ROOM_NO_SHOW_WINDOW_DAYS',
  'ROOM_NO_SHOW_RECORD_AT',
  'ROOM_NO_SHOW_PREAPPROVAL_AT',
  'MEMBERSHIP_RENEWAL_NOTICE_DAYS',
  'PRIVILEGED_ROLES',
  // Read by the directory to count the accounts a sweep would warn, which is the whole of its
  // effect until K-111 builds the sweep itself.
  'RETENTION_FULL_ACCOUNT_YEARS',
  'SIGN_IN_ATTEMPTS_PER_ACCOUNT',
  'TRAINING_CARRY_OVER_DAYS',
  'TRAINING_EXPIRY_WARNING_DAYS',
  'TRAINING_FINAL_WARNING_DAYS',
  'TRAINING_LEDGER_MONTHS',
  'TRAINING_SWEEP_ARMED',
  'SIGN_IN_ATTEMPTS_PER_ADDRESS_WINDOW_MINUTES',
  'UNVERIFIED_ACCOUNT_DAYS',
  'UNVERIFIED_EXPIRY_CAP',
  'VERIFY_RESEND_ATTEMPTS',
  'VERIFY_RESEND_WINDOW_MINUTES',
] as const satisfies readonly ConfigKey[]

export function isEnforced(key: ConfigKey): boolean {
  return (ENFORCED_KEYS as readonly string[]).includes(key)
}

export function isSensitive(key: ConfigKey): boolean {
  return 'sensitive' in CONFIG_KEYS[key]
}

// A key the register proposed no value for. Reading one is a defect, not a fallback: the
// feature that needs it waits on its workshop (0019).
export function hasDefault(key: ConfigKey): boolean {
  return 'default' in CONFIG_KEYS[key]
}
