import { db } from '@nuxthub/db'
import { users } from '~~/server/db/schema/user'
import { seedUsers } from './seed/users'
import { seedVenueFeatures, seedVenues, printVenuesSummary } from './seed/venues'
import { seedTicketTypes, printTicketTypesSummary } from './seed/ticketTypes'
import { seedShows, printShowsSummary } from './seed/shows'
import { seedReservations } from './seed/reservations'
import { seedShifts } from './seed/shifts'

/**
 * Seeds every entity in dependency order. Add a file under server/tasks/seed/
 * and import it here.
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
      const createdUsers = await seedUsers()

      // Seed venue features (must come before venues)
      const features = await seedVenueFeatures()

      // Seed venues with their feature associations
      const seededVenues = await seedVenues(features)

      // Seed ticket types
      const createdTicketTypes = await seedTicketTypes()

      // Seed shows and performances (depends on venues and ticket types)
      const { seededShows, seededPerformances } = await seedShows(seededVenues, createdTicketTypes)

      // Seed reservations (depends on users, shows, and ticket types)
      await seedReservations(createdUsers, seededShows, seededPerformances, createdTicketTypes)

      // Seed the rota (depends on users and performances)
      await seedShifts(createdUsers, seededPerformances)

      // Print summary

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
