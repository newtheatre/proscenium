import { Database } from 'bun:sqlite'
import type { AppUnderTest } from './webview'

// A config value forced for one e2e case (PRIVILEGED_ROLES, say), written straight to the
// running app's own database rather than through a route, so no session need hold the grant.
export function overrideConfig(app: AppUnderTest, key: string, value: unknown): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT OR REPLACE INTO config (key, value, updated_by, updated_at) VALUES (?, ?, NULL, ?)')
      .run(key, JSON.stringify(value), Math.floor(Date.now() / 1000))
  }
  finally {
    database.close()
  }
}

export function clearConfigOverride(app: AppUnderTest, key: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('DELETE FROM config WHERE key = ?').run(key)
  }
  finally {
    database.close()
  }
}
