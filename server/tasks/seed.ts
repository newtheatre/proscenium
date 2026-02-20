import { users } from 'hub:db:schema'
import { seedUsers, printUsersSummary } from './seed/users'
import { seedVenueFeatures, seedVenues, printVenuesSummary } from './seed/venues'
import { seedTicketTypes, printTicketTypesSummary } from './seed/ticketTypes'
import { seedShows, printShowsSummary } from './seed/shows'

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
      const seededVenues = await seedVenues(features)

      // Seed ticket types
      const createdTicketTypes = await seedTicketTypes()

      // Seed shows and performances (depends on venues)
      const { seededShows, seededPerformances } = await seedShows(seededVenues)

      // Print summary
      printUsersSummary()
      printVenuesSummary()
      printTicketTypesSummary(createdTicketTypes)
      printShowsSummary(seededShows, seededPerformances)

      console.log('\n✅ Database seeded successfully!\n')
      return { result: 'Database seeded successfully' }
    }
    catch (error) {
      console.error('\n❌ Seeding failed:', error)
      throw error
    }
  },
})
