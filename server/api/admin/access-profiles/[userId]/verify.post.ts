import { verifyAccessProfileRequest } from '#shared/utils/access-profiles'

// Verify a declaration: the officer has sighted the evidence and agreed the door's wording.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'access.verify')
  const userId = getRouterParam(event, 'userId') ?? ''
  const input = await readValidatedBodyOrThrow(event, verifyAccessProfileRequest)

  await verifyAccessProfile(event, userId, resolved.account.id, input.fohNote, input.version)

  // Says only that there is an answer: the wording is read on the owner's own page (0050).
  await notify(event, {
    type: 'access-profile.verified',
    userId,
    context: { name: '', accessUrl: `${useRuntimeConfig(event).public.baseURL}/account/access` },
  })

  return { ok: true }
})
