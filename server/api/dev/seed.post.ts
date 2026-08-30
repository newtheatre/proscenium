// Seed the personas (K-124). Idempotent, because a developer runs it whenever they are unsure.
export default defineEventHandler(async () => {
  return { ok: true, ...await seedPersonas() }
})
