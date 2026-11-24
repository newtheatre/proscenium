// Marks places attended or absent; attended signs off the session's steps in the same unit (S6, TR-13).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { attendanceInput } from '../../../../inputs'
import { markAttendance } from '../../../../sessions'

export default defineRoute({
  ability: 'training.session.run',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: attendanceInput,
}, (_event, { record, input, actor, unit }) => markAttendance(unit.view(), actor, record!.id, input.marks))
