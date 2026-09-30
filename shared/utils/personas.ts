// The people a developer needs to be in order to see anything: one per kind of authority, plus the
// three states that are easy to forget exist (K-124).

export interface Persona {
  email: string
  name: string
  role: string | null
  describes: string
  // A guest holds no password, and a tombstone is anonymised. Both are real states of an account.
  shape: 'full' | 'guest' | 'tombstone'
  // Absent is no membership at all, which is what most personas should show a screen.
  membership?: 'CURRENT'
}

export const PERSONA_PASSWORD = 'development-only-password'

// Shared by every 'full' persona, so a developer's authenticator app keeps working across a
// reseed instead of enrolling again each time (K-124 criterion 1).
export const PERSONA_TOTP_SECRET = 'CH6VSTK2YBU4ANNZA3ER25KVXHJAOAJ5'

export const PERSONAS: Persona[] = [
  // Module A: identity

  { email: 'dev-admin@e2e.newtheatre.org.uk', name: 'Ada Admin (dev)', role: 'ADMIN', shape: 'full', describes: 'Everything, including the settings and the roll of Fellows.' },
  { email: 'dev-president@e2e.newtheatre.org.uk', name: 'Pru President (dev)', role: 'PRESIDENT', shape: 'full', describes: 'Reads the audit trail, the open safety items and the season figures; writes no money and grants no role (0113).' },
  { email: 'dev-secretary@e2e.newtheatre.org.uk', name: 'Sol Secretary (dev)', role: 'SECRETARY', shape: 'full', describes: 'The welfare officer: verifies access profile declarations and reads the roll of Fellows. Not general box office (D-127).' },
  { email: 'dev-committee@e2e.newtheatre.org.uk', name: 'Cal Committee (dev)', role: 'COMMITTEE', shape: 'full', describes: 'A post with no standing work of its own yet: the season figures and reports, nothing else.' },
  { email: 'dev-member@e2e.newtheatre.org.uk', name: 'Mel Member (dev)', role: null, shape: 'full', describes: 'An ordinary account: no roles, nothing in the admin screens.' },
  { email: 'dev-guest@e2e.newtheatre.org.uk', name: 'Gus Guest (dev)', role: null, shape: 'guest', describes: 'No password and no way in, the way guest checkout leaves one (A-116).' },
  { email: 'dev-erased@e2e.newtheatre.org.uk', name: 'Term Tombstone (dev)', role: null, shape: 'tombstone', membership: 'CURRENT', describes: 'Anonymised, so every screen has to keep working around it (0011). Its current term is kept for the statistics and left off the register, which says so.' },

  // Module C: spaces

  { email: 'dev-booker@e2e.newtheatre.org.uk', name: 'Bea Booker (dev)', role: null, shape: 'full', membership: 'CURRENT', describes: 'An ordinary member holding a current membership, so the room forms open rather than refuse (issue 1338).' },

  // Module E: show night

  { email: 'dev-foh@e2e.newtheatre.org.uk', name: 'Fen Foh (dev)', role: 'FOH_MANAGER', shape: 'full', describes: 'Sets up the programme and its prices, works the desk, runs the bar and its stock, and opens the door, the till and the duty manager screens with no shift, audited for it (0044, 0090, 0111).' },

  // Module G: training, and safety

  { email: 'dev-theatre@e2e.newtheatre.org.uk', name: 'Tam Theatre (dev)', role: 'THEATRE_MANAGER', shape: 'full', describes: 'The rooms, the training catalogue and its leads, and the open safety items (0112).' },

  // Module I: finance

  { email: 'dev-treasurer@e2e.newtheatre.org.uk', name: 'Theo Treasurer (dev)', role: 'TREASURER', shape: 'full', describes: 'Reads the ledger: forgone comp and discount value, and every finance report built after it.' },
]
