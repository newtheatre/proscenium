// Proof only: a unit of work is a list of statements committed as one D1 batch.
export interface Refusal { code: 'conflict', reason: string }
export function unitOfWork(db: D1Database) {
  const statements: D1PreparedStatement[] = []
  return {
    add(sql: string, ...params: unknown[]) { statements.push(db.prepare(sql).bind(...params)); return this },
    // Aborts the whole batch unless the statement just added changed exactly `rows` rows.
    expect(rows: number) { statements.push(db.prepare('INSERT INTO core_guard (ok) SELECT CASE WHEN changes() = ? THEN 1 ELSE NULL END').bind(rows)); return this },
    audit(action: string, record: string) { return this.add('INSERT INTO core_audit (action, record, actor_name) VALUES (?, ?, ?)', action, record, 'A Person') },
    async commit(): Promise<{ ok: true } | { ok: false, refusal: Refusal }> {
      try { await db.batch([...statements, db.prepare('DELETE FROM core_guard')]); return { ok: true } }
      catch (error) {
        const message = String((error as Error).message)
        if (/core_guard|CHECK constraint/.test(message)) return { ok: false, refusal: { code: 'conflict', reason: message } }
        throw error
      }
    },
  }
}
