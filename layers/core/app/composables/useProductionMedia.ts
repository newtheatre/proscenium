// A production's poster and photos (C-23, C-24), for the two places they are managed: the poster in
// the production page's side panel, and everything on its Media tab. Both read the same data by one
// key, so a change made in either shows in both. An image is uploaded, checked and cleaned in the
// background, then described and put to use: a public image is never used without a description.
import { useTimeoutFn } from '@vueuse/core'

export interface MediaFile {
  id: string
  slot: string
  url: string | null
  state: 'pending' | 'ready' | 'rejected' | 'deleted'
  altText: string | null
  width: number | null
  height: number | null
  rejectedReason: string | null
  restorableUntil?: number
}
export interface Media { poster: MediaFile | null, photos: MediaFile[], waiting: MediaFile[], removed: MediaFile[] }

export const POSTER = 'core.production-poster'
export const PHOTOS = 'core.production-photos'
export const IMAGE_TYPES = 'image/png,image/jpeg,image/webp'
export const REFUSED_IMAGE: Record<string, string> = {
  'type-not-accepted': 'This is not a PNG, JPEG or WebP image.',
  'too-large': 'This image is larger than the theatre allows.',
  'damaged': 'This image could not be read.',
  'upload-timeout': 'This upload did not finish in time.',
}

export async function useProductionMedia(productionId: string) {
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const { confirm } = useConfirm()
  const toast = useToast()
  const base = `/api/core/productions/${productionId}/media`
  const { data, status, error, refresh } = await useAPI<Media>(base, { key: `core:production:${productionId}:media` })
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const busy = ref<string | null>(null)
  const descriptions = reactive<Record<string, string>>({})

  // While an upload is still being checked, look again shortly.
  const checking = computed(() => (data.value?.waiting ?? []).some(f => f.state === 'pending'))
  const { start: lookAgain } = useTimeoutFn(async () => {
    await refresh()
    if (checking.value) lookAgain()
  }, 1500, { immediate: false }) // not-policy: how soon to look at a file being checked
  watch(checking, on => on && lookAgain(), { immediate: true })

  watch(data, (d) => {
    for (const f of [...(d?.waiting ?? []), ...(d?.photos ?? []), ...(d?.poster ? [d.poster] : [])]) descriptions[f.id] ??= f.altText ?? ''
  }, { immediate: true })

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    refusal.value = null
    busy.value = key
    try {
      await fn()
      // The poster is a line of the page's readiness checklist.
      await Promise.all([refresh(), refreshNuxtData(`core:record-checks:core.production:${productionId}`)])
      if (done) toast.add({ title: done, color: 'success', icon: 'i-lucide-circle-check' })
      return true
    }
    catch (e) {
      refusal.value = toRefusal(e)
      return false
    }
    finally {
      busy.value = null
    }
  }

  async function upload(slot: string, chosen: File | File[] | null | undefined) {
    const files = [chosen ?? []].flat()
    if (!files.length) return
    await run(`upload:${slot}`, async () => {
      for (const file of files) {
        await $api('/api/core/files', { method: 'POST', query: { slot, owner: productionId, name: file.name }, body: file, headers: { 'content-type': file.type || 'application/octet-stream' } })
      }
    })
  }

  async function use(file: MediaFile) {
    const description = (descriptions[file.id] ?? file.altText ?? '').trim()
    await run(`use:${file.id}`, async () => {
      if (description !== (file.altText ?? '')) await $api(`/api/core/files/${file.id}`, { method: 'PATCH', body: { altText: description } })
      await $api(base, { method: 'POST', body: { fileId: file.id } })
    }, file.slot === POSTER ? 'Poster changed' : 'Photo added')
  }

  async function describe(file: MediaFile) {
    const description = (descriptions[file.id] ?? '').trim()
    if (!description || description === file.altText) return
    await run(`describe:${file.id}`, () => $api(`/api/core/files/${file.id}`, { method: 'PATCH', body: { altText: description } }), 'Description saved')
  }

  async function remove(file: MediaFile) {
    const inUse = file.state === 'ready' && (file.id === data.value?.poster?.id || data.value?.photos.some(p => p.id === file.id))
    if (inUse && !await confirm({
      verb: 'Remove',
      thing: file.slot === POSTER ? 'the poster' : 'this photo',
      consequence: 'It comes off the production at once. You can put it back from "Recently removed" on the Media tab for a while.',
      button: 'Remove',
    })) return
    await run(`remove:${file.id}`, () => $api(`${base}/${file.id}`, { method: 'DELETE' }), inUse ? 'Removed' : undefined)
  }

  const restore = (file: MediaFile) => run(`restore:${file.id}`, () => $api(`${base}/${file.id}/restore`, { method: 'POST' }), file.slot === POSTER ? 'Poster put back' : 'Photo put back')

  async function move(index: number, by: -1 | 1) {
    const ids = (data.value?.photos ?? []).map(p => p.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + by, 0, moved!)
    await run('order', () => $api(`${base}/order`, { method: 'PUT', body: { fileIds: ids } }))
  }

  return { data, status, error, refresh, refusal, busy, descriptions, upload, use, describe, remove, restore, move }
}
