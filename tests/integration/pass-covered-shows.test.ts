import { describe, expect, test } from 'bun:test'
import { passCoveredShowsQuery } from '#server/utils/passes'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'

// D-135 criterion 1 on the real migrations: what the pass page offers to book ahead.

describe('the pass page lists the shows a holder can still book with it (D-135)', () => {
  test('a covered show still to come is listed, a finished, unpublished or uncovered one is not', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database)
      const now = tonight.startsAt - 60
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-1', 'one@example.invalid', 'One'],
        ['INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)', 'show-done', 'finished', 'Finished', 'PUBLISHED'],
        ['INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)', 'show-draft', 'draft', 'Draft', 'DRAFT'],
        ['INSERT INTO performances (id, show_id, venue_id, starts_at, duration_minutes, status) VALUES (?, ?, ?, ?, ?, ?)',
          'performance-done', 'show-done', tonight.venueId, now - 86_400, 120, 'ON_SALE'],
        ['INSERT INTO performances (id, show_id, venue_id, starts_at, duration_minutes, status) VALUES (?, ?, ?, ?, ?, ?)',
          'performance-draft', 'show-draft', tonight.venueId, now + 86_400, 120, 'ON_SALE'],
        ['INSERT INTO pass_types (id, slug, name, status, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?)', 'pt-1', 'season', 'Season pass', 'ON_SALE', 0, 4_102_444_800],
        ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)', 'price-1', 'pt-1', 'Standard', 4500],
        ['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', 'c-1', 'pt-1', tonight.showId],
        ['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', 'c-2', 'pt-1', 'show-done'],
        ['INSERT INTO pass_type_shows (id, pass_type_id, show_id) VALUES (?, ?, ?)', 'c-3', 'pt-1', 'show-draft'],
        ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'pass-1', 'ABC234', 'pt-1', 'price-1', 'u-1', 4500, 'ACTIVE', 'u-1'],
      ])

      const listed = rows<{ slug: string }>(database, ...boundStatement(database, passCoveredShowsQuery('pass-1', now)))
      expect(listed.map(show => show.slug)).toEqual(['a-test-show-a'])
    }
    finally {
      database.close()
    }
  })
})
