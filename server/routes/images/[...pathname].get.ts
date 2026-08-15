export default eventHandler(async (event) => {
  const { pathname } = getRouterParams(event)

  // A catch-all matches `/images/` with nothing after it, so `pathname` is
  // genuinely optional and blob.serve now types it as required.
  if (!pathname) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  setHeader(event, 'Content-Security-Policy', 'default-src \'none\';')
  return blob.serve(event, pathname)
})
