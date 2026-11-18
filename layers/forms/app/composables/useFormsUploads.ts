// Uploading file answers from a form's own page. The page that sends answers provides this; the
// builder's preview and the version history do not, so their file questions say nothing is kept.
import type { InjectionKey, Ref } from 'vue'
import type { FileRef, Question } from '../../shared/engine'

export interface FormsUploads {
  /** Stores a file for a question; resolves with the reference to keep as the answer, still being checked. */
  upload: (question: Question, file: File) => Promise<FileRef>
  /** Waits for core's check: 'ready', or the reason the file was refused. */
  settle: (id: string) => Promise<{ state: 'ready' } | { state: 'rejected', reason: string | null }>
}

export const FORMS_UPLOADS: InjectionKey<FormsUploads> = Symbol('forms-uploads')

const POLL = 800 // not-policy: how often the page asks whether a file has been checked
const PATIENCE = 120 // not-policy: polls before the page stops waiting (about a minute and a half)

/** Provides uploads for the form at `slug`, into the response `responseId`. */
export function provideFormsUploads(slug: Ref<string>, responseId: Ref<string>, place?: Ref<string>): FormsUploads {
  const { $api } = useNuxtApp()
  const base = () => `/api/forms/open/${encodeURIComponent(slug.value)}/files`
  const uploads: FormsUploads = {
    async upload(question, file) {
      const sent = await $api<FileRef>(base() as string, {
        method: 'POST',
        query: { response: responseId.value, question: question.id, name: file.name, type: file.type || 'application/octet-stream', ...(place?.value ? { place: place.value } : {}) },
        body: file,
        headers: { 'content-type': file.type || 'application/octet-stream' },
      })
      return { id: sent.id, name: sent.name, size: sent.size, type: sent.type }
    },
    async settle(id) {
      for (let i = 0; i < PATIENCE; i++) {
        const now = await $api<{ state: string, reason: string | null }>(`${base()}/${encodeURIComponent(id)}` as string, { query: { response: responseId.value } })
        if (now.state === 'ready') return { state: 'ready' }
        if (now.state !== 'pending') return { state: 'rejected', reason: now.reason }
        await new Promise(resolve => setTimeout(resolve, POLL))
      }
      // Still being checked: the answer keeps it, and sending says so if it has not finished by then.
      return { state: 'ready' }
    },
  }
  provide(FORMS_UPLOADS, uploads)
  return uploads
}
