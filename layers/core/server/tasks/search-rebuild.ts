// Daily: refills a search index whose rows differ from its table's (S8), as after a database is
// exported with its indexes dropped and they are made again, or after an import. A migration that
// adds a searched column fills its index itself; this is the repair. It also turns secure-delete back
// on where an index has lost it (S4).
import { defineTask, useContext } from '#kit'
import { rebuildSearchIndexStatement, searchIndexStates } from '#kit/search'

export default defineTask(async (unit) => {
  for (const state of await searchIndexStates(useContext().env.DB)) {
    if (!state.secureDelete) unit.add({ sql: `INSERT INTO \`${state.index}\` (\`${state.index}\`, rank) VALUES ('secure-delete', 1)`, params: [] })
    if (state.indexed !== state.rows) unit.add({ sql: rebuildSearchIndexStatement(state.index), params: [] })
  }
})
