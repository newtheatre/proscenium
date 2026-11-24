// A form's published versions, readable without forms.ts, which actions.ts would otherwise import back.
import { all, first } from '#kit'

export interface VersionRow { id: string, number: number, definition: string, definitionHash: string, changeSummary: string, publishedBy: string, publishedAt: number }

export const VERSION = 'id, number, definition, definition_hash AS definitionHash, change_summary AS changeSummary, published_by AS publishedBy, created_at AS publishedAt'
export const getVersion = (id: string | null) => id ? first<VersionRow>(`SELECT ${VERSION} FROM forms_versions WHERE id = ?`, id) : Promise.resolve(null)
export const listVersions = (formId: string) => all<Omit<VersionRow, 'definition'>>('SELECT id, number, definition_hash AS definitionHash, change_summary AS changeSummary, published_by AS publishedBy, created_at AS publishedAt FROM forms_versions WHERE form_id = ? ORDER BY number DESC', formId)
