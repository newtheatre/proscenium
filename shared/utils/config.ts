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
  PASS_PRODUCTS: {
    schema: z.array(z.object({
      name: z.string(),
      pricePence: z.number().int().nonnegative(),
      cap: z.number().int().positive().nullable(),
    })),
    workshop: 'money-and-box-office',
    describes: 'The season pass products: names, prices and caps. Listed in the workshop; unset until then.',
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
  ROOM_BOOKING_HORIZON: {
    schema: z.enum(['END_OF_TERM', 'END_OF_SEASON']),
    default: 'END_OF_TERM',
    workshop: 'spaces-and-training',
    describes: 'How far ahead a member may book.',
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
  ROOM_NO_SHOW_RECORD_AT: {
    schema: z.number().int().positive(),
    default: 2,
    workshop: 'spaces-and-training',
    describes: 'No-shows in a term before the member is formally recorded.',
  },
  ROOM_NO_SHOW_PREAPPROVAL_AT: {
    schema: z.number().int().positive(),
    default: 3,
    workshop: 'spaces-and-training',
    describes: 'No-shows in a term before every further booking needs pre-approval.',
  },
  ROOM_PRIORITY_TIERS: {
    schema: z.array(z.string()).nonempty(),
    default: ['PRODUCTION', 'COMMITTEE', 'REHEARSAL', 'GENERAL'],
    workshop: 'spaces-and-training',
    describes: 'Booking priority, highest first. A higher tier bumps a lower one with notification.',
  },
  ROOM_OPENING_HOURS: {
    schema: z.record(z.string(), z.array(z.object({
      day: z.number().int().min(0).max(6),
      opens: z.string(),
      closes: z.string(),
    }))),
    workshop: 'spaces-and-training',
    describes: 'Opening hours per room, London. Set in the workshop; unset until then.',
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
  TRAINING_CARRY_OVER_DAYS: {
    schema: z.number().int().positive(),
    default: 60,
    workshop: 'spaces-and-training',
    describes: 'Carry-over window across the academic year boundary. A constant in the old module.',
  },
  ACADEMIC_YEAR_BOUNDARY: {
    schema: z.string().regex(/^\d{2}-\d{2}$/),
    default: '08-31',
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

  NOTIFICATION_TOPICS: {
    schema: z.array(z.string()).nonempty(),
    default: ['bookings', 'shifts', 'training', 'rooms', 'announcements'],
    workshop: 'people-and-communications',
    describes: 'Topics a member may set preferences on. Transactional messages always deliver (0013).',
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
    describes: 'Standing recipients of the end-of-night report. The list is confirmed in the workshop.',
  },
} as const satisfies Record<string, ConfigKeyDefinition>

export type ConfigKey = keyof typeof CONFIG_KEYS

export const CONFIG_KEY_NAMES = Object.keys(CONFIG_KEYS) as ConfigKey[]

export function isConfigKey(name: string): name is ConfigKey {
  return Object.hasOwn(CONFIG_KEYS, name)
}

// A key the register proposed no value for. Reading one is a defect, not a fallback: the
// feature that needs it waits on its workshop (0019).
export function hasDefault(key: ConfigKey): boolean {
  return 'default' in CONFIG_KEYS[key]
}
