export default defineEventHandler(async (event) => {
  const db = event.context.cloudflare.env.DB as D1Database
  const row = await db.prepare('SELECT 1 AS ok').first()
  return { d1: row, runtime: navigator.userAgent }
})
