// One entry per table holding something about a person: the export builds the bundle from it and
// erasure decides from it. A table missing here is one nobody exports and nobody erases (K-109).

export type Erasure
  // Scrubbed in place: the row is a statistic and survives without the person in it.
  = | 'scrub'
  // Removed outright: a credential, or something consented to rather than recorded about them.
    | 'delete'
  // Left alone: the append-only trail, redacted rather than rewritten (0010, 0011).
    | 'keep'

export interface PersonalTable {
  name: string
  // The column tying a row to a person. Every query is built from it, so none can forget it.
  column: string
  // What the export calls this, or null for something no export should carry.
  section: string | null
  // The allow-listed columns the export returns. Never the whole row.
  columns: string[] | null
  erasure: Erasure
  // The columns a scrub clears, for a table that survives without its person.
  scrub?: string[]
  // What a scrubbed column becomes where it cannot be null. Nulling a NOT NULL column fails the
  // whole erasure batch, and erasure is all or nothing (0011).
  scrubTo?: Record<string, string>
  why: string
}

export const PERSONAL_TABLES: PersonalTable[] = [
  // Module A: identity

  {
    name: 'users',
    column: 'id',
    section: 'account',
    columns: ['name', 'email', 'pronouns', 'phone', 'student_id', 'verified', 'created_at', 'last_login_at'],
    erasure: 'scrub',
    // The rewrite is not a null-out, so anonymiseAccount writes it rather than the generic scrub.
    why: 'The person. The row survives so everything referring to it still resolves (0011).',
  },
  {
    name: 'emergency_contacts',
    column: 'user_id',
    section: 'emergency-contact',
    columns: ['name', 'phone', 'relation'],
    erasure: 'delete',
    why: 'Given for a purpose that ends with the account, and personal about a third party.',
  },
  {
    name: 'memberships',
    column: 'user_id',
    section: 'memberships',
    columns: ['starts_on', 'expires_on', 'source', 'confirmed_at', 'created_at'],
    erasure: 'scrub',
    scrub: ['evidence'],
    why: 'How many members there were in a year must survive; the evidence for one need not.',
  },
  {
    name: 'fellowships',
    column: 'user_id',
    section: 'fellowship',
    columns: ['awarded_on', 'awarded_by', 'citation', 'revoked_at'],
    erasure: 'scrub',
    scrub: ['revocation_reason'],
    // The citation names the person it honours and survives an erasure by decision: the roll is
    // the theatre's record, published at the time (A-127, awaiting committee confirmation).
    why: 'The theatre\'s own record of who it honoured. The award stands; why it was revoked need not.',
  },
  {
    name: 'role_grants',
    column: 'user_id',
    section: 'roles',
    columns: ['role', 'granted_at', 'expires_at'],
    erasure: 'scrub',
    scrub: ['note'],
    why: 'Who held which office in which year is governance history; the note about them is not.',
  },
  {
    name: 'totp_secrets',
    column: 'user_id',
    section: null,
    columns: null,
    erasure: 'delete',
    why: 'A credential. Exporting one would hand over the second factor itself.',
  },
  {
    name: 'recovery_codes',
    column: 'user_id',
    section: null,
    columns: null,
    erasure: 'delete',
    why: 'A credential, held only as hashes.',
  },
  {
    name: 'passkeys',
    column: 'user_id',
    section: null,
    columns: null,
    erasure: 'delete',
    why: 'A credential, and its label is whatever the owner called their laptop.',
  },
  {
    name: 'auth_tokens',
    column: 'user_id',
    section: null,
    columns: null,
    erasure: 'delete',
    why: 'A credential in flight, and one of them carries an address.',
  },
  {
    name: 'passkey_challenges',
    column: 'user_id',
    section: null,
    columns: null,
    erasure: 'delete',
    why: 'A ceremony in flight, five minutes long, holding nothing but a random string.',
  },
  {
    name: 'mfa_attempts',
    column: 'user_id',
    section: null,
    columns: null,
    erasure: 'delete',
    why: 'A password step waiting for its second factor, which expires anyway.',
  },

  // Module C: spaces

  {
    name: 'room_bookings',
    column: 'user_id',
    section: 'bookings',
    columns: ['title', 'starts_at', 'ends_at', 'status', 'reason', 'rejection_reason', 'created_at'],
    erasure: 'scrub',
    // The row survives because the room was used and that is a fact about the room, not the
    // person. What they wrote about it does not, and neither does what was written back (0011).
    scrub: ['title', 'notes', 'reason', 'rejection_reason'],
    scrubTo: { title: 'Erased booking' },
    why: 'Rooms this person booked. Utilisation survives an erasure; their words in it do not.',
  },
  {
    name: 'room_series',
    column: 'user_id',
    // Its own section: the bundle keys by section, so sharing one loses a table.
    section: 'booking-series',
    columns: ['title', 'frequency', 'starts_on', 'clock_from', 'clock_to', 'occurrences'],
    erasure: 'scrub',
    // The rule its occurrences follow: the rooms were used, what they were called is theirs (0011).
    scrub: ['title'],
    scrubTo: { title: 'Erased series' },
    why: 'A term of rooms this person booked. Utilisation survives an erasure; their words do not.',
  },
  {
    name: 'room_no_shows',
    column: 'user_id',
    section: 'no-shows',
    columns: ['kind', 'recorded_at'],
    erasure: 'keep',
    // Nothing here needs scrubbing: the reference resolves to the tombstone the user row became
    // and the ladder dies with it. Append-only does not forbid one, as audit_log shows (0010).
    why: 'Rooms booked and not used. The statistics survive an erasure; the person in them does not.',
  },
  {
    name: 'external_requests',
    column: 'user_id',
    section: 'other-room-requests',
    columns: ['title', 'purpose', 'starts_at', 'ends_at', 'status', 'rejection_reason', 'created_at'],
    erasure: 'scrub',
    // The ask is a fact about the estate; the member's words about it are theirs (0011).
    scrub: ['title', 'notes', 'rejection_reason'],
    scrubTo: { title: 'Erased request' },
    why: 'Rooms we do not manage that this person asked for. What was asked survives; their words do not.',
  },
  {
    name: 'external_requests',
    column: 'decided_by',
    section: null,
    columns: null,
    erasure: 'scrub',
    // The officer who handled somebody else's ask is cleared like every other officer column;
    // who did it stays in the audit trail, which erasure redacts on its own terms (0011).
    scrub: ['submitted_by', 'decided_by'],
    why: 'Requests for rooms we do not manage that this person handled for somebody else. The request survives; the officer does not.',
  },
  {
    name: 'room_bookings',
    column: 'decided_by',
    section: null,
    columns: null,
    erasure: 'scrub',
    // Matches every other officer column in the module: the decision is a fact, the decider is not.
    scrub: ['decided_by'],
    why: 'Room requests this person approved or turned down. The decision survives; the officer does not.',
  },
  {
    name: 'external_assignments',
    column: 'recorded_by',
    section: null,
    columns: null,
    erasure: 'scrub',
    // What we were offered is a fact about the room, not about us; who typed it in is in the audit trail.
    scrub: ['recorded_by'],
    why: 'What was offered, and whether it suited. The record survives; the officer does not.',
  },
  {
    name: 'external_space_notes',
    column: 'written_by',
    section: null,
    columns: null,
    erasure: 'scrub',
    // What we learned about a room outlives whoever wrote it down; the audit trail keeps who.
    scrub: ['written_by'],
    why: 'An officer noted what a room we do not manage is no good for. The knowledge survives; the officer does not.',
  },
  {
    name: 'room_blackouts',
    column: 'created_by',
    section: null,
    columns: null,
    erasure: 'scrub',
    // The closure is a fact about the room and stays; who typed it in is in the audit trail,
    // which is where an officer's acts belong (0010, 0011).
    scrub: ['created_by'],
    why: 'An officer closed a room. The closure survives an erasure; the officer in it does not.',
  },
  {
    name: 'room_feed_tokens',
    column: 'user_id',
    section: null,
    columns: null,
    erasure: 'delete',
    // The link is a credential. Left behind, an erased person's calendar would keep resolving.
    why: 'A calendar subscription the account holds. It ends with the account (C-104).',
  },

  // Module D: ticketing

  {
    name: 'venue_emergency_info',
    column: 'updated_by',
    section: null,
    columns: null,
    erasure: 'keep',
    // Every column describes the building. The editor is a reference the tombstone still answers,
    // as `config.updated_by` is.
    why: 'A description of a building, not of a person. Front of house reads it in the dark, so nothing removes it.',
  },
  {
    name: 'access_profiles',
    column: 'user_id',
    // buildBundle is always scoped to one account, so this is the person's own export only;
    // export-bundle.ts decrypts the payload rather than returning ciphertext (D-127 criterion 4).
    section: 'access',
    columns: ['status', 'companions', 'encrypted_payload', 'encryption_iv', 'consent_foh_at', 'verified_at', 'expires_at', 'created_at'],
    // Deletion is what a GDPR erasure gives it, immediately (D-127 criterion 5); withdrawal by the
    // owner is the other, slower route to the same end, run by its own 30-day sweep.
    erasure: 'delete',
    why: 'Special category data. Erasure removes the row outright rather than anonymising it (D-127).',
  },
  {
    name: 'access_profiles',
    column: 'verified_by',
    section: null,
    columns: null,
    erasure: 'scrub',
    scrub: ['verified_by'],
    why: 'Which officer sighted the evidence and agreed the wording. The decision survives; the officer does not.',
  },

  // Module E: show night

  {
    name: 'shift_templates',
    column: 'updated_by',
    section: null,
    columns: null,
    erasure: 'keep',
    // How a venue is staffed is a fact about the house. The officer who last typed it is a
    // reference the tombstone still answers, as `venue_emergency_info.updated_by` is.
    why: 'How many of each role a venue needs. It describes the house, not the person who set it up.',
  },
  {
    name: 'shifts',
    column: 'user_id',
    section: 'shifts',
    columns: ['performance_id', 'role', 'slot', 'status', 'claimed_at', 'confirmed_at'],
    erasure: 'scrub',
    scrub: ['notes', 'decline_reason'],
    // Who staffed which performance is the staffing record the night report and E-123 read; a
    // note written on the slot is not.
    why: 'Which performances somebody worked. The staffing record survives; a note on the slot does not.',
  },

  // Module F: bar

  {
    name: 'variant_prices',
    column: 'created_by',
    section: null,
    columns: null,
    erasure: 'keep',
    // Append-only, so nothing here could be rewritten anyway (0010). Every column is a price and
    // a date; the only thing about a person is which account set it.
    why: 'What the bar charged from a date. It is what a past sale resolved against, so nothing removes it.',
  },
  {
    name: 'stock_movements',
    column: 'actor_id',
    section: null,
    columns: null,
    erasure: 'keep',
    // Append-only, so nothing here could be rewritten anyway (0010). The reason is a vocabulary
    // rather than free text, so no movement can name a person in the first place.
    why: 'A stock movement is financial evidence. It stamps who moved the stock, and the tombstone still answers for it.',
  },
  {
    name: 'till_sessions',
    column: 'opened_by',
    section: null,
    columns: null,
    erasure: 'keep',
    // Holds no free text at all: an opener and a closer, a venue and a night, both timestamps.
    why: 'Who opened and closed a night\'s till is the accountable record the reconciliation reads (F-118); the tombstone still answers for it.',
  },
  {
    name: 'stocktakes',
    column: 'opened_by',
    section: null,
    columns: null,
    erasure: 'keep',
    // Holds no free text: an opener and an applier, both timestamps, and a status.
    why: 'Who opened and applied a stocktake is what any on-hand figure audits to (F-115); the tombstone still answers for it.',
  },

  // Module G: training

  {
    name: 'department_leads',
    column: 'user_id',
    section: 'training',
    columns: ['department', 'granted_at', 'expires_at'],
    // Nothing free-text is held: the assignment is a department and two dates, and who stewarded
    // a department in a year is governance history the same way an office is (G-110).
    erasure: 'keep',
    why: 'Departments this person led. Stewardship history survives an erasure, and it names nobody else.',
  },
  {
    name: 'training_records',
    column: 'user_id',
    // Its own section: `department_leads` already holds `training`, and the bundle keys by section.
    section: 'training-records',
    // The reason is exported as well as scrubbed: it is a thing written about them, the way a
    // booking's rejection reason is, and a subject access request reaches it.
    columns: ['module_id', 'awarded_on', 'expires_on', 'source', 'evidence_ref', 'revoked_at', 'revoke_reason', 'created_at'],
    erasure: 'scrub',
    // The append-only trigger names this clearing as one of its three sanctioned edits, so the
    // generic statement runs here rather than a bespoke one (0010, 0011, G-122 criterion 6).
    scrub: ['evidence_ref', 'revoke_reason'],
    // `granted_by` and `revoked_by` hold the acting officer rather than the subject, so they are
    // not scrubbed and resolve to the tombstone, as `config.updated_by` does.
    why: 'Training this person held. Who was competent to do what is safety history; the evidence for it and the words written about them are not.',
  },
  {
    name: 'module_requests',
    column: 'user_id',
    section: 'training-requests',
    // The reply is exported as well as scrubbed: it is a thing written about them and shown to
    // them, the way a booking's rejection reason is.
    columns: ['module_id', 'note', 'status', 'reason', 'created_at'],
    erasure: 'scrub',
    scrub: ['note', 'reason'],
    why: 'What this person asked to be taught. How much demand a module had is worth keeping; what they wrote about themselves, and what was written back, is not.',
  },
  {
    name: 'training_sessions',
    column: 'trainer_id',
    section: 'training-sessions',
    columns: ['held_on', 'starts_at', 'ends_at', 'place', 'capacity', 'status', 'created_at'],
    erasure: 'scrub',
    // `trainer_id` is NOT NULL and stays pointing at the tombstoned account, so what the session
    // was survives the person who ran it.
    scrub: ['notes', 'cancel_reason'],
    why: 'Sessions this person ran. What training the theatre delivered is safety history; the trainer\'s notes on a night are not.',
  },
  {
    name: 'session_attendees',
    column: 'user_id',
    section: 'training-attendance',
    columns: ['session_id', 'status', 'source', 'signed_up_at', 'marked_at', 'created_at'],
    // Nothing free-text is held: the row is a session, an order and a mark. Who was taught what
    // on which night is the evidence a training record rests on, so it survives an erasure.
    erasure: 'keep',
    why: 'Sessions this person signed up to and was marked at. Attendance is safety history, and it names nobody else.',
  },

  // Module H: communications

  {
    name: 'notification_preferences',
    column: 'user_id',
    section: 'notification-preferences',
    columns: ['topic', 'email', 'push'],
    erasure: 'delete',
    why: 'A choice about messages nobody will send.',
  },
  {
    name: 'notification_log',
    column: 'user_id',
    section: 'messages',
    columns: ['type', 'channel', 'subject', 'status', 'sent_at'],
    erasure: 'scrub',
    // The subject is rendered with the account name, so it carries one.
    scrub: ['subject', 'error'],
    why: 'What was sent and whether it arrived is an operational count; the subject line is not.',
  },
  {
    name: 'inbox_items',
    column: 'user_id',
    section: 'inbox',
    columns: ['type', 'title', 'body', 'created_at', 'read_at'],
    erasure: 'delete',
    why: 'Messages written to the person, and prose about them.',
  },

  // Module I: finance

  {
    name: 'ledger_entries',
    column: 'actor_id',
    section: 'money',
    columns: ['happened_at', 'london_day', 'source', 'tender', 'total_pence'],
    erasure: 'keep',
    // Nothing here needs scrubbing: the reference resolves to the tombstone the user row became.
    // Append-only does not forbid one, as audit_log shows (0004, 0010, 0011).
    why: 'Money the theatre took. Sales statistics survive an erasure; the person in them does not.',
  },

  // Module J: governance

  {
    name: 'audit_log',
    column: 'actor_id',
    section: 'activity',
    columns: ['action', 'target', 'created_at'],
    erasure: 'keep',
    why: 'Append-only (0010). Erasure redacts identifying values in detail and rewrites nothing.',
  },
  {
    name: 'config',
    column: 'updated_by',
    section: null,
    columns: null,
    erasure: 'keep',
    why: 'A setting, not personal data. The editor is a reference the tombstone still answers.',
  },

  // Module K: platform

  {
    name: 'backup_drills',
    column: 'operator_id',
    section: null,
    columns: null,
    erasure: 'keep',
    why: 'Append-only (0010). The operator is a reference the tombstone still answers, as config\'s editor is.',
  },
]

export const EXPORTED_TABLES = PERSONAL_TABLES.filter(entry => entry.section !== null)
