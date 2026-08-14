export default eventHandler(async (event) => {
  const { pathname } = getRouterParams(event)

  // A catch-all route matches `/images/` with nothing after it, so `pathname`
  // is genuinely optional. It used to be passed straight through and `blob.serve`
  // now types its argument as a string, which is what surfaced this.
  if (!pathname) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  setHeader(event, 'Content-Security-Policy', 'default-src \'none\';')
  return blob.serve(event, pathname)
})
