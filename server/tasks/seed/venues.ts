import { db } from '@nuxthub/db'
import { venues, venueFeatures, venuesToFeatures } from '~~/server/db/schema/venue'

/**
 * Seed Venue Features
 *
 * Creates default venue features (accessibility, amenities, etc.)
 */
export async function seedVenueFeatures() {
  console.log('✨ Seeding venue features...')

  const featuresToCreate = [
    {
      name: 'Wheelchair Accessible',
      description: 'Venue has wheelchair access and accessible seating',
      icon: '♿',
    },
    {
      name: 'Hearing Loop',
      description: 'Venue is equipped with a hearing loop system',
      icon: '🦻',
    },
    {
      name: 'Parking Available',
      description: 'Parking facilities available on-site or nearby',
      icon: '🅿️',
    },
    {
      name: 'Bar Available',
      description: 'Licensed bar serving drinks before and during intervals',
      icon: '🍺',
    },
    {
      name: 'Air Conditioning',
      description: 'Climate-controlled venue with air conditioning',
      icon: '❄️',
    },
    {
      name: 'Step-Free Access',
      description: 'No steps throughout the venue',
      icon: '🚶',
    },
  ]

  const createdFeatures = await db.insert(venueFeatures).values(featuresToCreate).returning()
  console.log(`  ✅ Created ${createdFeatures.length} venue features`)

  return createdFeatures
}

/**
 * Seed Venues
 *
 * Creates default venue locations with their associated features
 */
export async function seedVenues(features: Awaited<ReturnType<typeof seedVenueFeatures>>) {
  console.log('📍 Seeding venues...')

  const venuesToCreate = [
    {
      name: 'New Theatre',
      address: 'Cherry Tree Hill, Nottingham NG7 2RD',
      capacity: 80,
      description: 'The New Theatre is a student-run theatre located on the University of Nottingham campus. Established in 1969, it has been a cornerstone of student theatre for nearly a century.',
    },
    {
      name: 'Lakeside Arts Theatre',
      address: 'University Park, Nottingham NG7 2RD, UK',
      capacity: 225,
      description: 'A professional theatre space on the University of Nottingham campus, featuring modern facilities and excellent sightlines.',
    },
    {
      name: 'Djanogly Theatre',
      address: 'Nottingham Lakeside Arts, University of Nottingham, University Park, Nottingham NG7 2RD, UK',
      capacity: 180,
      description: 'An intimate performance space ideal for smaller productions and experimental theatre.',
    },
  ]

  const createdVenues = await db.insert(venues).values(venuesToCreate).returning()
  console.log(`  ✅ Created ${createdVenues.length} venues`)

  // Assign features to venues
  const venueFeatureAssignments = [
    // New Theatre features
    { venueId: createdVenues[0]!.id, featureId: features[0]!.id }, // Wheelchair Accessible
    { venueId: createdVenues[0]!.id, featureId: features[3]!.id }, // Bar Available
    // Lakeside Arts Theatre features
    { venueId: createdVenues[1]!.id, featureId: features[0]!.id }, // Wheelchair Accessible
    { venueId: createdVenues[1]!.id, featureId: features[1]!.id }, // Hearing Loop
    { venueId: createdVenues[1]!.id, featureId: features[2]!.id }, // Parking Available
    { venueId: createdVenues[1]!.id, featureId: features[3]!.id }, // Bar Available
    { venueId: createdVenues[1]!.id, featureId: features[4]!.id }, // Air Conditioning
    { venueId: createdVenues[1]!.id, featureId: features[5]!.id }, // Step-Free Access
    // Djanogly Theatre features
    { venueId: createdVenues[2]!.id, featureId: features[0]!.id }, // Wheelchair Accessible
    { venueId: createdVenues[2]!.id, featureId: features[1]!.id }, // Hearing Loop
    { venueId: createdVenues[2]!.id, featureId: features[4]!.id }, // Air Conditioning
    { venueId: createdVenues[2]!.id, featureId: features[5]!.id }, // Step-Free Access
  ]

  await db.insert(venuesToFeatures).values(venueFeatureAssignments)
  console.log(`  ✅ Assigned features to venues`)

  return createdVenues
}

/**
 * Print seeded venues information
 */
export function printVenuesSummary() {
  console.log('\n📍 Seeded venues:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('• New Theatre (Capacity: 80)')
  console.log('• Lakeside Arts Theatre (Capacity: 225)')
  console.log('• Djanogly Theatre (Capacity: 180)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n✨ Seeded venue features:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('♿ Wheelchair Accessible')
  console.log('🦻 Hearing Loop')
  console.log('🅿️ Parking Available')
  console.log('🍺 Bar Available')
  console.log('❄️ Air Conditioning')
  console.log('🚶 Step-Free Access')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}
