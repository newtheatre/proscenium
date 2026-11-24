// One bill and what can be done to it: save a draft, attach the supplier's file, submit, approve or
// send back. The file is checked after upload, so attaching waits until the check has finished.
import type { BillBody, BillChoices, SavedBill, SavedBillLine } from './useBillDraft'

export type BillState = 'draft' | 'submitted' | 'open' | 'closed'
export interface BillView {
  bill: SavedBill & { id: string, state: BillState, version: number, currency: string, netMinor: number, taxMinor: number, totalMinor: number, allocatedMinor: number, returnedNote: string, createdBy: string | null }
  lines: (SavedBillLine & { id: string, netMinor: number })[]
  fileUrl: string | null
  choices: BillChoices | null
  mine: boolean
  canEdit: boolean
  canApprove: boolean
}

const WAIT_MS = 1000 // not-policy: how often to look for the file check's end
const TRIES = 20 // not-policy: twenty seconds, longer than any check takes

export async function useBill(id: Ref<string>) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const toast = useToast()
  const { toRefusal } = useRefusal()
  const { data, status, error, refresh } = await useAPI<BillView>(() => `/api/invoicing/bills/${id.value}`, { key: `invoicing:bill:${id.value}` })
  const bill = computed(() => data.value?.bill)
  const fail = (e: unknown) => {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  const done = async (title: string) => {
    toast.add({ title, color: 'success' })
    await refresh()
  }

  async function save(body: BillBody) {
    await $api(`/api/invoicing/bills/${id.value}`, { method: 'PUT', body: { ...body, version: bill.value!.version } })
    await done(t('invoicing.screens.draft.saved'))
  }
  async function remove() {
    try {
      await $api(`/api/invoicing/bills/${id.value}`, { method: 'DELETE', body: { version: bill.value!.version } })
      await navigateTo('/console/invoicing/bills')
    }
    catch (e) { fail(e) }
  }
  async function attach(file: File) {
    try {
      const uploaded = await $api<{ id: string }>('/api/core/files', { method: 'POST', query: { slot: 'invoicing.bill-file', owner: id.value, name: file.name }, body: file, headers: { 'content-type': file.type || 'application/octet-stream' } })
      for (let tries = 0; ; tries++) {
        try {
          await $api(`/api/invoicing/bills/${id.value}/file`, { method: 'POST', body: { fileId: uploaded.id } })
          break
        }
        catch (e) {
          if (toRefusal(e).code !== 'core.files.not-ready' || tries >= TRIES) throw e
          await new Promise(resolve => setTimeout(resolve, WAIT_MS))
        }
      }
      await done(t('invoicing.screens.bill.file-attached'))
    }
    catch (e) { fail(e) }
  }
  async function submit() {
    try {
      await $api(`/api/invoicing/bills/${id.value}/submit`, { method: 'POST', body: { version: bill.value!.version } })
      await done(t('invoicing.screens.bill.submitted'))
    }
    catch (e) { fail(e) }
  }
  async function approve() {
    try {
      await $api(`/api/invoicing/bills/${id.value}/approve`, { method: 'POST', body: { version: bill.value!.version, expectedTotalMinor: bill.value!.totalMinor } })
      await done(t('invoicing.screens.bill.approved'))
    }
    catch (e) { fail(e) }
  }
  async function sendBack(note: string) {
    await $api(`/api/invoicing/bills/${id.value}/return`, { method: 'POST', body: { version: bill.value!.version, note } })
    await done(t('invoicing.screens.bill.returned'))
  }
  return { data, status, error, refresh, bill, save, remove, attach, submit, approve, sendBack }
}
