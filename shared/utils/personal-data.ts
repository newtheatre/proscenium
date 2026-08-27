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
  why: string
}

export const PERSONAL_TABLES: PersonalTable[] = [
  {
    name: 'users',
    column: 'id',
    section: 'account',
    columns: ['name', 'email', 'pronouns', 'verified', 'created_at', 'last_login_at'],
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
    columns: ['year', 'source', 'created_at'],
    erasure: 'scrub',
    scrub: ['evidence'],
    why: 'How many members there were in a year must survive; the evidence for one need not.',
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
  {
    name: 'audit_log',
    column: 'actor_id',
    section: 'activity',
    columns: ['action', 'target', 'created_at'],
    erasure: 'keep',
    why: 'Append-only (0010). Erasure redacts identifying values in detail and rewrites nothing.',
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
    name: 'mfa_attempts',
    column: 'user_id',
    section: null,
    columns: null,
    erasure: 'delete',
    why: 'A password step waiting for its second factor, which expires anyway.',
  },
  {
    name: 'config',
    column: 'updated_by',
    section: null,
    columns: null,
    erasure: 'keep',
    why: 'A setting, not personal data. The editor is a reference the tombstone still answers.',
  },
]

export const EXPORTED_TABLES = PERSONAL_TABLES.filter(entry => entry.section !== null)
