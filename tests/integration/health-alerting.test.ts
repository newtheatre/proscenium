import { describe, test } from 'bun:test'

// J-106 criteria 3 and 5, seeded ahead of the scheduled task and the notification type. Each
// becomes a real test once a health check is persisted somewhere durable across cron runs.
describe('sustained unhealthiness reaches the IT Manager (J-106 criterion 5)', () => {
  test.todo('a first unhealthy check opens an incident and sends nothing yet', () => {})

  test.todo('a second unhealthy check inside the configured window still sends nothing', () => {})

  test.todo('unhealthiness lasting past the configured window notifies once, not on every run', () => {})

  test.todo('a check that recovers closes the incident, so the next failure alerts again from cold', () => {})
})
