// Previews a brand before it is saved: the tokens for light and dark, and an email as it would look
// (C-35). Changes nothing, so it needs only a signed-in person.
import { defineRoute } from '#kit'
import { brandChoice, tokensFor } from '../../../brand/theme'
import { render } from '../../../notifications/render'
import { theatreName } from '../../../notifications/send'
import { brandInput } from '../../../brand/input'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: brandInput.pick({ accent: true, neutral: true, displayFont: true, radius: true, defaultMode: true }),
}, async (_event, { input }) => {
  const tokens = tokensFor({ ...(await brandChoice()), ...stripUndefined(input) })
  const email = render(
    { subject: 'Your tickets for {{ theatre }}', body: 'Thank you for booking.\n\n[View your tickets]({{ link }})' },
    { values: { link: 'https://example.org/tickets' }, kinds: { link: 'url' }, accent: tokens.light.link, theatre: await theatreName('Your theatre') },
  )
  return { tokens, email: { subject: email.subject, html: email.html } }
})

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}
