/**
 * What this app declares to the auth service: its role namespace, the roles it
 * reads, and the permissions each carries. Served at /api/_hooks/auth/manifest.
 */

export const APP_MANIFEST = {
  contract: 1,
  namespace: 'proscenium',
  version: '1',

  // Named capabilities. The ability layer moves onto these in its own change;
  // for now they reproduce the three-tier truth table exactly.
  permissions: [
    { key: 'staff.access', description: 'Reach box-office and back-office surfaces' },
    { key: 'reservation.manage', description: 'List, create and amend reservations, and issue or redeem passes' },
    { key: 'programme.manage', description: 'Create and edit venues, shows, performances, ticket types and pass products' },
    { key: 'money.refund', description: 'Refund a ticket, delete a reservation or cancel an issued pass' },
    { key: 'user.manage', description: 'Create and edit rows in the local user mirror' },
    { key: 'catalogue.delete', description: 'Delete programme records outright' },
    { key: 'user.delete.any', description: 'Delete another person from the local mirror' },
  ],

  roles: [
    {
      role: 'ADMIN',
      description: 'Full access, including destructive deletes.',
      defaultExpiry: { kind: 'committee-year' },
      permissions: [
        'staff.access',
        'reservation.manage',
        'programme.manage',
        'money.refund',
        'user.manage',
        'catalogue.delete',
        'user.delete.any',
      ],
      requiresEligibility: null,
    },
    {
      role: 'MANAGER',
      description: 'Programme and box-office management, short of destructive deletes.',
      defaultExpiry: { kind: 'committee-year' },
      permissions: ['staff.access', 'reservation.manage', 'programme.manage', 'money.refund', 'user.manage'],
      requiresEligibility: null,
    },
    {
      role: 'BOX_OFFICE',
      description: 'Sells and admits on the door. No refunds, no programme edits.',
      defaultExpiry: { kind: 'committee-year' },
      permissions: ['staff.access', 'reservation.manage'],
      requiresEligibility: null,
    },
  ],

  eligibilityRules: [],
} as const

export type AppManifest = typeof APP_MANIFEST
