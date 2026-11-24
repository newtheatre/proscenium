// A space's control follows whether the theatre runs it (rule C6).
import { defineListener } from '#kit'
import { followManaged } from '../setup'

export default defineListener(async (event, unit) => {
  followManaged(unit, event.payload.spaceId as string, event.payload.managed as boolean)
})
