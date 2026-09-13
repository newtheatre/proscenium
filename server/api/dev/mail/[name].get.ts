import { isAbsolute, relative, resolve } from 'node:path'

// Development only (K-124 criterion 5): nuxt.config keeps server/api/dev/** out of a build
// entirely, the same as the rest of the surface, so no runtime guard is needed here either.
export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') ?? ''

  // `relative`, not a string prefix: a prefix check compares platform separators by hand, and
  // `../../secrets` would otherwise read anything the process can, not only a letter this wrote.
  const path = resolve(MAILBOX, name)
  const fromMailbox = relative(resolve(MAILBOX), path)
  if (fromMailbox.startsWith('..') || isAbsolute(fromMailbox) || !name.endsWith('.html')) {
    throw createError({ statusCode: 404, statusMessage: 'No such letter' })
  }

  const { readFile } = await import('node:fs/promises')
  const html = await readFile(path, 'utf8').catch(() => null)
  if (html === null) throw createError({ statusCode: 404, statusMessage: 'No such letter' })

  setResponseHeader(event, 'content-type', 'text/html')
  setResponseHeader(event, 'content-security-policy', 'default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'')
  return html
})
