import type { H3Event } from 'h3'

// What a room may be booked for (C-119). The list is committee-editable, so it is checked at the
// write path rather than frozen into a CHECK or a zod enum (0012, 0033's reasoning).

export async function requirePurpose(event: H3Event | undefined, value: string): Promise<string> {
  const allowed = await configValue(event, 'ROOM_PURPOSES')
  if (allowed.includes(value)) return value

  throw createError({
    statusCode: 422,
    statusMessage: `A booking is for one of: ${allowed.join(', ')}`,
  })
}
