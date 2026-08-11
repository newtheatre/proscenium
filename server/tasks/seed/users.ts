import { db } from '@nuxthub/db'
import { users, userRoles } from '~~/server/db/schema/user'

/**
 * Seed Users and Roles
 *
 * Creates default user accounts with different role assignments for testing.
 */
export async function seedUsers() {
  console.log('👥 Seeding users...')

  // Hash the default development password
  const defaultPassword = await hashPassword('DevPassword123!')

  // Create users
  const usersToCreate = [
    {
      email: 'admin@newtheatre.org.uk',
      password: defaultPassword,
      name: 'Admin User',
      verified: true,
    },
    {
      email: 'manager@newtheatre.org.uk',
      password: defaultPassword,
      name: 'Manager User',
      verified: true,
    },
    {
      email: 'boxoffice@newtheatre.org.uk',
      password: defaultPassword,
      name: 'Box Office User',
      verified: true,
    },
    {
      email: 'user@newtheatre.org.uk',
      password: defaultPassword,
      name: 'Regular User',
      verified: true,
    },
    {
      email: 'unverified@newtheatre.org.uk',
      password: defaultPassword,
      name: 'Unverified User',
      verified: false,
    },
  ]

  const createdUsers = await db.insert(users).values(usersToCreate).returning()
  console.log(`  ✅ Created ${createdUsers.length} users`)

  // Assign roles to users
  const rolesToCreate = [
    // Admin user gets all roles
    { userId: createdUsers[0]!.id, role: 'ADMIN' as const },
    { userId: createdUsers[0]!.id, role: 'MANAGER' as const },
    { userId: createdUsers[0]!.id, role: 'BOX_OFFICE' as const },
    // Manager user
    { userId: createdUsers[1]!.id, role: 'MANAGER' as const },
    // Box Office user
    { userId: createdUsers[2]!.id, role: 'BOX_OFFICE' as const },
  ]

  await db.insert(userRoles).values(rolesToCreate)
  console.log(`  ✅ Assigned ${rolesToCreate.length} roles`)

  return createdUsers
}

/**
 * Print seeded users information
 */
export function printUsersSummary() {
  console.log('\n📋 Seeded users:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Email: admin@newtheatre.org.uk')
  console.log('Password: DevPassword123!')
  console.log('Roles: ADMIN, MANAGER, BOX_OFFICE')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Email: manager@newtheatre.org.uk')
  console.log('Password: DevPassword123!')
  console.log('Roles: MANAGER')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Email: boxoffice@newtheatre.org.uk')
  console.log('Password: DevPassword123!')
  console.log('Roles: BOX_OFFICE')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Email: user@newtheatre.org.uk')
  console.log('Password: DevPassword123!')
  console.log('Roles: None')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Email: unverified@newtheatre.org.uk')
  console.log('Password: DevPassword123!')
  console.log('Verified: No')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}
