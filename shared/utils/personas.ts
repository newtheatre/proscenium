// The people a developer needs to be in order to see anything: one per kind of authority, plus the
// three states that are easy to forget exist (K-124).

export interface Persona {
  email: string
  name: string
  role: string | null
  describes: string
  // A guest holds no password, and a tombstone is anonymised. Both are real states of an account.
  shape: 'full' | 'guest' | 'tombstone'
}

export const PERSONA_PASSWORD = 'development-only-password'

export const PERSONAS: Persona[] = [
  { email: 'dev-admin@e2e.newtheatre.org.uk', name: 'Ada Admin (dev)', role: 'ADMIN', shape: 'full', describes: 'Everything, including the settings and the roll of Fellows.' },
  { email: 'dev-manager@e2e.newtheatre.org.uk', name: 'Mo Manager (dev)', role: 'MANAGER', shape: 'full', describes: 'The trail, the register and the accounts, but not the roles.' },
  { email: 'dev-theatre@e2e.newtheatre.org.uk', name: 'Tam Theatre (dev)', role: 'THEATRE_MANAGER', shape: 'full', describes: 'Reads the roll and the register; records neither.' },
  { email: 'dev-training@e2e.newtheatre.org.uk', name: 'Tri Training (dev)', role: 'TRAINING_MANAGER', shape: 'full', describes: 'Reads accounts, the register and the rooms: the one role whose sidebar is partial.' },
  { email: 'dev-boxoffice@e2e.newtheatre.org.uk', name: 'Bo Boxoffice (dev)', role: 'BOX_OFFICE', shape: 'full', describes: 'A role with no admin permissions yet, for checking a refusal.' },
  { email: 'dev-member@e2e.newtheatre.org.uk', name: 'Mel Member (dev)', role: null, shape: 'full', describes: 'An ordinary account: no roles, nothing in the admin screens.' },
  { email: 'dev-guest@e2e.newtheatre.org.uk', name: 'Gus Guest (dev)', role: null, shape: 'guest', describes: 'No password and no way in, the way guest checkout leaves one (A-116).' },
  { email: 'dev-erased@e2e.newtheatre.org.uk', name: 'Term Tombstone (dev)', role: null, shape: 'tombstone', describes: 'Anonymised, so every screen has to keep working around it (0011).' },
]
