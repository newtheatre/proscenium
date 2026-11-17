// C-52: sets the sending domain up automatically, as Mailflare adds a domain. Asks Cloudflare to
// onboard <label>.<site host> for Email Sending (Cloudflare writes its DNS records) through the
// declared external call, makes it the sending domain, and queues the test message for when
// Cloudflare accepts it. core.sender.manage is privileged, so the kit asks for a fresh passkey
// check first; the setting changes are audited with the setting history. Pressing it again adopts
// the subdomain if it already exists. Replacing a different sending domain needs `replace: true`,
// which the screen asks for after showing the old and the new. The event subscription for bounces
// and complaints is not created here: that stays a deploy step.
import { z } from 'zod'
import { defineRoute, externalCall, nowMs, refuse, useSetting } from '#kit'
import { automaticPlan } from '../../../notifications/automatic'
import { CloudflareError, createSendingSubdomain, findZone, listSendingSubdomains } from '../../../notifications/cloudflare'

export default defineRoute({
  ability: 'core.sender.manage',
  rateLimit: 'write',
  input: z.object({ replace: z.boolean().optional() }),
}, async (event, { input }) => {
  const plan = await automaticPlan(event)
  if (plan.unavailable === 'workers-dev') refuse('core.notifications.automatic-workers-dev', 'A site on workers.dev cannot send email from its own address.', { status: 409, remedy: 'Add a custom domain to the Worker, open the site there, then try again.' })
  if (plan.unavailable === 'local') refuse('core.notifications.automatic-local', 'This site has no public domain to send email from.', { status: 409 })
  if (plan.unavailable === 'no-token') refuse('core.notifications.automatic-no-token', 'Setting the domain up automatically needs a Cloudflare token.', { status: 409, remedy: 'Save a Cloudflare token with Email Sending edit and Zone read under Keys on this page, or set the domain up by hand.' })
  const name = plan.proposed!
  const current = await useSetting('core.notifications.sending-domain') as string | null
  if (current && current !== name && input.replace !== true)
    refuse('core.notifications.replace-domain', `Email is sent from ${current} now. Confirm to send from ${name} instead.`, { status: 409, fields: { replace: 'required' } })

  let zone: { id: string, name: string } | null
  try {
    zone = await findZone(name)
  }
  catch (error) {
    refuse('core.notifications.automatic-refused', `Cloudflare refused the token (${error instanceof CloudflareError ? error.status : 'no answer'}).`, { status: 502, remedy: 'Check the token has Zone read and Email Sending edit, then try again.' })
  }
  if (!zone) refuse('core.notifications.automatic-no-zone', `None of the zones this token can see holds ${name}.`, { status: 409, remedy: 'Give the token access to the zone that holds the site\'s domain, or set the domain up by hand.' })

  // Each press is its own attempt: Cloudflare's create is idempotent (it re-enables an existing
  // subdomain), so a repeat cannot do anything twice, and a failure stays fixable.
  const result = await externalCall('core.create-sending-domain', {
    reference: ['core.sending-domain', name],
    key: `core.create-sending-domain:${name}:${nowMs()}`,
    call: async () => {
      try {
        const made = await createSendingSubdomain(zone.id, name)
        return { result: 'succeeded', providerReference: made.tag }
      }
      catch (error) {
        // Adopt one that already exists, whatever the create said about it.
        const existing = (await listSendingSubdomains(zone.id).catch(() => [])).find(s => s.name === name && s.enabled)
        if (existing) return { result: 'succeeded', providerReference: existing.tag }
        return { result: 'failed', data: { status: error instanceof CloudflareError ? error.status : 0, codes: error instanceof CloudflareError ? error.codes : [] } }
      }
    },
  })
  if (result.state === 'unknown') refuse('core.notifications.automatic-unknown', 'Cloudflare did not answer in time. Proscenium will check what happened in a few minutes.', { status: 503 })
  if (result.state === 'failed') {
    const data = result.outcome?.data as { status?: number, codes?: number[] } | undefined
    refuse('core.notifications.automatic-failed', `Cloudflare did not set up ${name} (${data?.status ?? 0}${data?.codes?.length ? `, ${data.codes.join(', ')}` : ''}).`, { status: 502, remedy: 'Check the token has Email Sending edit on this zone, then try again, or set the domain up by hand.' })
  }
  return { domain: name, verifying: true }
})
