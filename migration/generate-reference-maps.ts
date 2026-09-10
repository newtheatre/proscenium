#!/usr/bin/env bun
// Drafts room-map.tsv, space-map.tsv and ticket-type-map.tsv against rows already authored in
// the target. Run after the target's own catalogue exists; a consuming transform refuses a blank.
import { Database } from 'bun:sqlite'
import { ensureOut, latestStamp, loadDump } from './lib'
import { draftReferenceMap } from './reference-map'

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.error('Usage: bun migration/generate-reference-maps.ts <target-database>')
  console.error('The target must already carry the rooms, union venues and ticket types it will')
  console.error('be matched against: author them first, through their own admin screens.')
  process.exit(1)
}

const stamp = await latestStamp()
ensureOut()
const target = new Database(applyTo, { readonly: true })

const roomsSource = await loadDump('rooms', stamp)

const oldRooms = roomsSource.query<{ id: number, name: string }, []>('SELECT id, name FROM rooms').all()
const targetRooms = new Map(
  target.query<{ id: string, name: string }, []>('SELECT id, name FROM rooms').all().map(row => [row.name, row.id]),
)
const roomResult = await draftReferenceMap('room-map.tsv', 'room:', oldRooms, targetRooms)

const oldVenues = roomsSource.query<{ id: number, room_name: string }, []>('SELECT id, room_name FROM external_venues').all()
  .map(row => ({ id: row.id, name: row.room_name }))
const targetSpaces = new Map(
  target.query<{ id: string, name: string }, []>('SELECT id, name FROM external_spaces').all().map(row => [row.name, row.id]),
)
const spaceResult = await draftReferenceMap('space-map.tsv', 'venue:', oldVenues, targetSpaces)
roomsSource.close()

// No prefix: reservations.ts looks a ticket type up by the raw old id, the same convention
// transform-programme.ts already established for out/performance-map.tsv.
const prosceniumSource = await loadDump('proscenium', stamp)
const oldTicketTypes = prosceniumSource.query<{ id: string, name: string }, []>('SELECT id, name FROM ticket_types').all()
  .map(row => ({ id: row.id, name: row.name.toLowerCase() }))
// ticket_types.name carries both a case-sensitive and a case-insensitive unique index
// (ticket_types_name_nocase): matched case-insensitively, the stronger guarantee available.
const targetTicketTypes = new Map(
  target.query<{ id: string, name: string }, []>('SELECT id, name FROM ticket_types').all()
    .map(row => [row.name.toLowerCase(), row.id]),
)
const ticketTypeResult = await draftReferenceMap('ticket-type-map.tsv', '', oldTicketTypes, targetTicketTypes)
prosceniumSource.close()

console.log(`room-map.tsv: ${roomResult.matched} matched, ${roomResult.blank} unconfirmed, of ${roomResult.written}`)
console.log(`space-map.tsv: ${spaceResult.matched} matched, ${spaceResult.blank} unconfirmed, of ${spaceResult.written}`)
console.log(`ticket-type-map.tsv: ${ticketTypeResult.matched} matched, ${ticketTypeResult.blank} unconfirmed, of ${ticketTypeResult.written}`)
if (roomResult.blank || spaceResult.blank || ticketTypeResult.blank) {
  console.log('\nA blank line names an old room, venue or ticket type with no exact name match')
  console.log('yet: author it through its own admin screen and rerun, or if it already exists')
  console.log('under a different name, fill in the target id by hand. A consuming transform')
  console.log('refuses to run while its map still has one.')
}

target.close()
