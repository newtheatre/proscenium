// Ticket types as a report's breakdown and filter (REP-43): every type, archived ones too, since an
// old report may still count tickets on one.
import { all } from '#kit'

export default {
  label: 'box-office.report-keys.ticket-type',
  async values() {
    return (await all<{ id: string, name: string }>('SELECT id, name FROM box_office_ticket_types ORDER BY lower(name)')).map(r => ({ value: r.id, label: r.name }))
  },
}
