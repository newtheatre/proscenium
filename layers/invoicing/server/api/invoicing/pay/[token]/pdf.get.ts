// The PDF of the invoice the link opens.
import { getRouterParam } from 'h3'
import { defineRoute, files as store, refuse } from '#kit'
import { publicPdf } from '../../../../public'

export default defineRoute({ public: true, rateLimit: 'presented-value', tokens: ['token'] }, async (event) => {
  const file = await publicPdf(getRouterParam(event, 'token') ?? '')
  const object = file ? await store.get(file.objectKey) : null
  if (!file || !object) return refuse('invoicing.pdf.not-ready', 'The PDF is not ready yet.', { status: 404, remedy: 'Try again in a minute.' })
  return new Response(object.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${file.name}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
