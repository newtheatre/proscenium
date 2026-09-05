import { verifyAccessProfileForm } from '#shared/utils/access-profiles'

// Verify a declaration: the officer has sighted the evidence and agreed the door's wording.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'access.verify')
  const userId = getRouterParam(event, 'userId') ?? ''
  const input = await readValidatedBodyOrThrow(event, verifyAccessProfileForm)

  await verifyAccessProfile(event, userId, resolved.account.id, input.fohNote)

  return { ok: true }
})
