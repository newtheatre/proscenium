#!/usr/bin/env bun
// Drafts room-map.tsv and space-map.tsv against rooms and venues already authored in the target.
// Run after the target's own catalogue exists; transform-bookings.ts refuses a blank line.
import { Database } from 'bun:sqlite'
import { ensureOut, latestStamp, loadDump } from './lib'
import { draftReferenceMap } from './reference-map'

const applyTo = process.argv.slice(2).find(argument => !argument.startsWith('-'))
if (!applyTo) {
  console.error('Usage: bun migration/generate-reference-maps.ts <target-database>')
  console.error('The target must already carry the rooms and union venues it will be matched')
  console.error('against: author them first, through their own admin screens, not here.')
  process.exit(1)
}

const stamp = await latestStamp()
ensureOut()
const source = await loadDump('rooms', stamp)
const target = new Database(applyTo, { readonly: true })

const oldRooms = source.query<{ id: number, name: string }, []>('SELECT id, name FROM rooms').all()
const targetRooms = new Map(
  target.query<{ id: string, name: string }, []>('SELECT id, name FROM rooms').all().map(row => [row.name, row.id]),
)
const roomResult = await draftReferenceMap('room-map.tsv', 'room:', oldRooms, targetRooms)

const oldVenues = source.query<{ id: number, room_name: string }, []>('SELECT id, room_name FROM external_venues').all()
  .map(row => ({ id: row.id, name: row.room_name }))
const targetSpaces = new Map(
  target.query<{ id: string, name: string }, []>('SELECT id, name FROM external_spaces').all().map(row => [row.name, row.id]),
)
const spaceResult = await draftReferenceMap('space-map.tsv', 'venue:', oldVenues, targetSpaces)

console.log(`room-map.tsv: ${roomResult.matched} matched, ${roomResult.blank} unconfirmed, of ${roomResult.written}`)
console.log(`space-map.tsv: ${spaceResult.matched} matched, ${spaceResult.blank} unconfirmed, of ${spaceResult.written}`)
if (roomResult.blank || spaceResult.blank) {
  console.log('\nA blank line names an old room or venue with no exact name match yet: author it')
  console.log('through its own admin screen and rerun, or if it already exists under a different')
  console.log('name, fill in the target id by hand. transform-bookings.ts refuses while either')
  console.log('file still has one.')
}

source.close()
target.close()
