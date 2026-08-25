# Database Seeding

This directory contains modular seed scripts for populating the database with initial development and testing data.

## Structure

```
server/tasks/
├── seed.ts              # Main coordinator that runs all seed scripts
└── seed/
    ├── README.md        # This file
    ├── users.ts         # User accounts and roles
    ├── venues.ts        # Venues and venue features
    └── [entity].ts      # Additional seed files (add as needed)
```

## Running Seeds

**To seed the database:** Open the `Tasks` tab in Nuxt DevTools and click on the `seed` task

**Nitro names a task after its file path, not after `meta.name`.** `server/tasks/seed.ts` is
registered as `seed` and `server/tasks/seed/shows.ts` as `seed:shows`, whatever `meta.name` says.
Keep the two equal when adding a task: a `meta.name` that disagrees is inert, and it is the name
that ends up copied into the documentation, where it 404s.

**To reset the database:**

```bash
bunx nuxt db drop-all
```

## Creating New Seed Files

When adding new entities to seed, follow this pattern:

### 1. Create a New Seed File

Create a new file in `server/tasks/seed/` named after your entity:

```typescript
// server/tasks/seed/shows.ts
import { shows, performances } from "hub:db:schema";

/**
 * Seed Shows
 *
 * Creates sample show data for testing
 */
export async function seedShows() {
  console.log("🎭 Seeding shows...");

  const showsToCreate = [
    {
      title: "Hamlet",
      slug: "hamlet",
      description: "Shakespeare's timeless tragedy...",
      // ... other fields
    },
    // ... more shows
  ];

  const createdShows = await db.insert(shows).values(showsToCreate).returning();

  console.log(`  ✅ Created ${createdShows.length} shows`);

  return createdShows;
}

/**
 * Print seeded shows information
 */
export function printShowsSummary() {
  console.log("\n🎭 Seeded shows:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("• Hamlet");
  console.log("• Macbeth");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
```

### 2. Update the Main Seed Task

Import and call your seed function in `server/tasks/seed.ts`:

```typescript
import { seedShows, printShowsSummary } from "./seed/shows";

export default defineTask({
  async run() {
    // ... existing seeds

    // Add your new seed
    const shows = await seedShows();

    // If your entity depends on others, pass them as parameters
    await seedPerformances(shows, venues);

    // Add to summary
    printShowsSummary();

    // ...
  },
});
```

## Best Practices

### Order Matters

Seed entities in dependency order. For example:

1. Users (no dependencies)
2. Venue Features (no dependencies)
3. Venues (depends on Venue Features)
4. Shows (no dependencies)
5. Performances (depends on Shows and Venues)
6. Reservations (depends on Performances and Users)

### Return Created Records

Always return created records from seed functions so dependent seeds can reference them:

```typescript
export async function seedVenues(features: VenueFeature[]) {
  const createdVenues = await db
    .insert(venues)
    .values(venuesToCreate)
    .returning();

  return createdVenues; // ← Return for use in other seeds
}
```

### Use Helper Functions

Break complex seeding into smaller functions:

```typescript
export async function seedTicketTypes() {
  const types = await seedBaseTicketTypes();
  await seedSpecialTicketTypes(types);
  return types;
}
```

### Document Your Seeds

Add JSDoc comments explaining:

- What the seed creates
- Any dependencies
- Special considerations

```typescript
/**
 * Seed Performances
 *
 * Creates sample performances for all shows at various venues.
 * Must run after seedShows() and seedVenues().
 *
 * @param shows - Previously created shows
 * @param venues - Previously created venues
 */
export async function seedPerformances(shows: Show[], venues: Venue[]) {
  // ...
}
```

### Keep Seeds Idempotent-Safe

The main seed task checks if data exists before running. Individual seed files don't need this check, but consider it for partial re-seeding:

```typescript
export async function seedVenues() {
  // Optional: check if venues already exist
  const existing = await db.select().from(venues).limit(1);
  if (existing.length > 0) {
    console.log("  ⚠️  Venues already exist, skipping...");
    return existing;
  }

  // ... create venues
}
```

### Realistic Test Data

Create meaningful test data that reflects real-world scenarios:

- Include edge cases (sold out shows, past performances, etc.)
- Use realistic names and descriptions
- Create variety in your data (different capacities, dates, prices)
- Consider accessibility features and requirements

### Summary Output

Always provide a summary function that outputs what was created:

```typescript
export function printShowsSummary() {
  console.log("\n🎭 Seeded shows:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("• Show 1 (3 performances)");
  console.log("• Show 2 (5 performances)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
```

## Example: Adding Performance Seeds

Here's a complete example of adding performance seeding:

```typescript
// server/tasks/seed/performances.ts
import { performances } from "hub:db:schema";
import type { Show, Venue } from "hub:db:schema";

export async function seedPerformances(shows: Show[], venues: Venue[]) {
  console.log("🎪 Seeding performances...");

  const performancesToCreate = [
    {
      showId: shows[0].id,
      venueId: venues[0].id,
      startDateTime: new Date("2026-03-15T19:30:00Z"),
      maxCapacity: venues[0].capacity,
      // ... other fields
    },
    // ... more performances
  ];

  const created = await db
    .insert(performances)
    .values(performancesToCreate)
    .returning();

  console.log(`  ✅ Created ${created.length} performances`);

  return created;
}

export function printPerformancesSummary() {
  console.log("\n🎪 Seeded performances:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("• 15 performances across 3 venues");
  console.log("• Dates: March 15 - March 30, 2026");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
```

Then in `server/tasks/seed.ts`:

```typescript
import {
  seedPerformances,
  printPerformancesSummary,
} from "./seed/performances";

export default defineTask({
  async run() {
    // ... existing seeds
    const shows = await seedShows();
    const performances = await seedPerformances(shows, venues);

    printPerformancesSummary();
    // ...
  },
});
```

## Tips

- **Testing**: Test your seeds by resetting and re-running frequently
- **Console Output**: Use emoji and clear formatting for easy scanning
- **Error Handling**: The main task handles errors, but add try/catch for complex operations
- **Performance**: For large datasets, consider batch inserts
- **Relationships**: Always seed parent entities before children
- **Cleanup**: The main task checks for existing data to prevent duplicates

## Common Patterns

### Many-to-Many Relationships

```typescript
export async function seedShowGenres(shows: Show[], genres: Genre[]) {
  const associations = [
    { showId: shows[0].id, genreId: genres[0].id },
    { showId: shows[0].id, genreId: genres[2].id },
    // ...
  ];

  await db.insert(showsToGenres).values(associations);
  console.log(`  ✅ Created ${associations.length} associations`);
}
```

### Date Ranges

```typescript
function generatePerformanceDates(startDate: Date, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return date;
  });
}
```

### Random Selection

```typescript
function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}
```

## Troubleshooting

**"Database already seeded"**: Reset with `bunx nuxt db push --force` first

**Foreign key errors**: Check the order of your seeds - parent entities must exist first

**Unique constraint violations**: Ensure your seed data has unique values where required

**Type errors**: Import types from `hub:db:schema` and use proper TypeScript

For more help, see the [Drizzle ORM documentation](https://orm.drizzle.team/) and [NuxtHub database docs](https://hub.nuxt.com/docs/features/database).
