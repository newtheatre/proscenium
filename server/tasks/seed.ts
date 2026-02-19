import { users } from 'hub:db:schema'
import { seedUsers, printUsersSummary } from './seed/users'
import { seedVenueFeatures, seedVenues, printVenuesSummary } from './seed/venues'

/**
 * Main Database Seeding Task
 *
 * Coordinates seeding of all database entities in the correct order.
 * To add new seed data, create a new file in server/tasks/seed/ and import it here.
 *
 * @see server/tasks/seed/README.md for documentation
 */
export default defineTask({
  meta: {
    name: 'db:seed',
    description: 'Seed database with initial data',
  },
  async run() {
    console.log('🌱 Seeding database...\n')

    // Check if database already has data
    const existingUsers = await db.select().from(users).all()

    if (existingUsers.length > 0) {
      console.log('⚠️  Database already has users. Skipping seed.')
      console.log('💡 To re-seed, first reset the database with: bunx nuxt db push --force\n')
      return { result: 'Database already seeded' }
    }

    try {
      // Seed users and roles
      await seedUsers()

      // Seed venue features (must come before venues)
      const features = await seedVenueFeatures()

      // Seed venues with their feature associations
      await seedVenues(features)

      // Future seed calls can be added here:
      // await seedShows()
      // await seedPerformances(venues)
      // etc.

      // Print summary
      printUsersSummary()
      printVenuesSummary()

      console.log('\n✅ Database seeded successfully!\n')
      return { result: 'Database seeded successfully' }
    }
    catch (error) {
      console.error('\n❌ Seeding failed:', error)
      throw error
    }
  },
})
