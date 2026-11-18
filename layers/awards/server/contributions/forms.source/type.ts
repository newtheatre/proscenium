// Award types as a forms.source: it names the award a nomination is for on the answering page and
// on the response. The names are public: they head the roll of honour. The shape below is the
// point's contract.
import { all } from '#kit'

export default {
  key: 'awards.type',
  label: 'awards.forms.source.label',
  allowed: async () => true,
  search: (text: string) => all<{ id: string, label: string }>('SELECT id, name AS label FROM awards_types WHERE state = \'active\' AND name LIKE \'%\' || ? || \'%\' ORDER BY position, lower(name) LIMIT 20', text.trim().replace(/[%_]/g, '')), // not-policy: a picker shows a short list
  async labels(ids: string[]) {
    const rows = await all<{ id: string, label: string }>('SELECT id, name AS label FROM awards_types WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
    return Object.fromEntries(rows.map(r => [r.id, r.label]))
  },
}
