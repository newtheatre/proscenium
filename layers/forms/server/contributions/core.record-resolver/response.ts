// A response's reference and where its form's responses are read.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ reference: string, formId: string }>('SELECT reference, form_id AS formId FROM forms_responses WHERE id = ?', id)
    return row ? { title: row.reference, to: `/console/forms/${row.formId}/responses?open=${id}` } : null
  },
}
