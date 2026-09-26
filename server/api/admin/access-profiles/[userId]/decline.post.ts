import { declineAccessProfileRequest } from '#shared/utils/access-profiles'

// Decline a declaration: the evidence did not check out, or the officer could not verify it. The
// owner reads why on their own page; the message only says there is an answer (0050).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'access.verify')
  const userId = getRouterParam(event, 'userId') ?? ''
  const input = await readValidatedBodyOrThrow(event, declineAccessProfileRequest)

  await declineAccessProfile(event, userId, resolved.account.id, input.reason, input.version)

  await notify(event, {
    type: 'access-profile.declined',
    userId,
    context: { name: '', accessUrl: `${useRuntimeConfig(event).public.baseURL}/account/access` },
  })

  return { ok: true }
})
