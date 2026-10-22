// What retiring a room would leave behind, counted for the Retire dialogue before it is pressed (0204).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''

  const room = await findRoom(id)
  if (!room) throw noSuch('room')

  const [counted] = await db.all<{ waiting: number, upcoming: number }>(heldCountStatement(id, Math.floor(Date.now() / 1000)))
  return { waiting: counted?.waiting ?? 0, upcoming: counted?.upcoming ?? 0 }
})
