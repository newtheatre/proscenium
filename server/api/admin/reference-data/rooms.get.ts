// The active rooms a venue may point at, id and name only: box office administers venues without
// holding `rooms.read`, so this stays a narrow picker rather than the rooms module's own screen.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.write')
  return (await listRooms(false)).map(room => ({ id: room.id, name: room.name }))
})
