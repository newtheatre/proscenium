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
    { key: 'foh.work', description: 'Reach the show night screen for a performance you are rostered on' },
    { key: 'shift.manage', description: 'Assign, confirm and reassign front-of-house shifts' },
    { key: 'access.verify', description: 'Verify access profiles, and read them outside show night' },
    { key: 'bar.manage', description: 'Manage the bar catalogue, stock, voids and exports' },
    { key: 'bar.tab', description: 'Run a bar tab and settle it later' },
    { key: 'foh.manage', description: 'Maintain the emergency card and the front-of-house contact list' },
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
        'foh.work',
        'shift.manage',
        'access.verify',
        'bar.manage',
        'bar.tab',
        'foh.manage',
      ],
      requiresEligibility: null,
    },
    {
      role: 'MANAGER',
      description: 'Programme and box-office management, short of destructive deletes.',
      defaultExpiry: { kind: 'committee-year' },
      permissions: [
        'staff.access',
        'reservation.manage',
        'programme.manage',
        'money.refund',
        'user.manage',
        'foh.work',
        'shift.manage',
        'bar.manage',
        'bar.tab',
        'foh.manage',
      ],
      requiresEligibility: null,
    },
    {
      role: 'BOX_OFFICE',
      description: 'Sells and admits on the door. No refunds, no programme edits.',
      defaultExpiry: { kind: 'committee-year' },
      // Carries foh.work so BOX_OFFICE+ bypasses the rota scope (ADR-0019).
      permissions: ['staff.access', 'reservation.manage', 'foh.work'],
      requiresEligibility: null,
    },
    {
      role: 'FOH_MANAGER',
      description: 'Runs the rota and verifies access profiles. Not a box-office seller.',
      defaultExpiry: { kind: 'committee-year' },
      permissions: ['staff.access', 'foh.work', 'shift.manage', 'access.verify', 'foh.manage'],
      requiresEligibility: null,
    },
    {
      // Held all year; a confirmed shift is what scopes it to a night (ADR-0019).
      role: 'FRONT_OF_HOUSE',
      description: 'Works a door shift. Sees tonight only, and no prices, emails or money.',
      defaultExpiry: { kind: 'committee-year' },
      permissions: ['foh.work'],
      requiresEligibility: null,
    },
    {
      // No staff.access and no foh.work: a tab is not a way into anything else.
      role: 'COMMITTEE',
      description: 'Committee member. May run a bar tab; no box office or admin access.',
      defaultExpiry: { kind: 'committee-year' },
      permissions: ['bar.tab'],
      requiresEligibility: null,
    },
  ],

  eligibilityRules: [],
} as const

export type AppManifest = typeof APP_MANIFEST
