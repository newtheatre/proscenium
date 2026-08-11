import { db } from '@nuxthub/db'
import { ticketTypes } from '~~/server/db/schema/ticket'

export default defineTask({
  meta: {
    name: 'db:seed:ticket-types',
    description: 'Seed database with initial data',
  },
  async run() {
    const createdTicketTypes = await seedTicketTypes()
    printTicketTypesSummary(createdTicketTypes)

    return { result: 'Database seeded successfully' }
  },
})

/**
 * Seed Ticket Types
 *
 * Creates a standard set of ticket types covering the most common pricing tiers
 * used at the NNT. Prices are stored in pence.
 */
export async function seedTicketTypes() {
  console.log('🎟️  Seeding ticket types...')

  const ticketTypesToCreate = [
    {
      name: 'Adult',
      description: 'Standard full-price adult ticket',
      price: 1000, // £12.00
      activeByDefault: true,
    },
    {
      name: 'Student/Concession',
      description: 'Reduced price for students, seniors (65+), and those on benefits',
      price: 700, // £8.00
      activeByDefault: true,
    },
    {
      name: 'Member',
      description: 'Discounted ticket for New Theatre members',
      price: 500, // £6.00
      activeByDefault: true,
    },
    {
        name: 'Fellow',
        description: 'Special discounted ticket for New Theatre Fellows',
        price: 0, // Free
        activeByDefault: true,
    },
    {
      name: 'Complimentary',
      description: 'Complimentary (free) ticket - for production teams, press, etc.',
      price: 0, // Free
      activeByDefault: false,
    },
  ]

  const created = await db.insert(ticketTypes).values(ticketTypesToCreate).returning()
  console.log(`  ✅ Created ${created.length} ticket types`)

  return created
}

export function printTicketTypesSummary(ticketTypes: Awaited<ReturnType<typeof seedTicketTypes>>) {
  console.log('\n🎟️  Ticket Types:')
  ticketTypes.forEach(tt => {
    const price = tt.price === 0 ? 'Free' : `£${(tt.price / 100).toFixed(2)}`
    const status = tt.activeByDefault ? 'active by default' : 'inactive by default'
    console.log(`  • ${tt.name} — ${price} (${status})`)
  })
}
