<script setup lang="ts">
// A production's poster and photos (C-23, C-24), managed on the production's own page. An image is
// uploaded, checked and cleaned in the background, then described and put to use: a public image is
// never used without a description. A new poster replaces the old in one step, and anything taken
// off can be put back while its restore period lasts.
import { useTimeoutFn } from '@vueuse/core'

interface MediaFile {
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
interface Media { poster: MediaFile | null, photos: MediaFile[], waiting: MediaFile[], removed: MediaFile[] }

const props = defineProps<{ productionId: string }>()

const POSTER = 'core.production-poster'
const PHOTOS = 'core.production-photos'
const ACCEPT = 'image/png,image/jpeg,image/webp'
const REFUSED: Record<string, string> = {
  'type-not-accepted': 'This is not a PNG, JPEG or WebP image.',
  'too-large': 'This image is larger than the theatre allows.',
  'damaged': 'This image could not be read.',
  'upload-timeout': 'This upload did not finish in time.',
}

const { $api } = useNuxtApp()
const { day } = useDates()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const base = computed(() => `/api/core/productions/${props.productionId}/media`)
const { data, status, error, refresh } = await useAPI<Media>(base, { key: `core:production:${props.productionId}:media` })
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

async function run(key: string, fn: () => Promise<unknown>, done?: string) {
  refusal.value = null
  busy.value = key
  try {
    await fn()
    await refresh()
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

// The pickers hold nothing between choices: each choice is uploaded at once and the picker emptied,
// so choosing again never sends the earlier files twice.
const picked = reactive<{ poster: File | null, photos: File[] }>({ poster: null, photos: [] })
async function upload(slot: string, chosen: File | File[] | null | undefined) {
  const files = [chosen ?? []].flat()
  picked.poster = null
  picked.photos = []
  if (!files.length) return
  await run(`upload:${slot}`, async () => {
    for (const file of files) {
      await $api('/api/core/files', { method: 'POST', query: { slot, owner: props.productionId, name: file.name }, body: file, headers: { 'content-type': file.type || 'application/octet-stream' } })
    }
  })
}

async function use(file: MediaFile) {
  const description = (descriptions[file.id] ?? file.altText ?? '').trim()
  await run(`use:${file.id}`, async () => {
    if (description !== (file.altText ?? '')) await $api(`/api/core/files/${file.id}`, { method: 'PATCH', body: { altText: description } })
    await $api(base.value, { method: 'POST', body: { fileId: file.id } })
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
    consequence: 'It comes off the production at once. You can put it back from "Recently removed" for a while.',
    button: 'Remove',
  })) return
  await run(`remove:${file.id}`, () => $api(`${base.value}/${file.id}`, { method: 'DELETE' }), inUse ? 'Removed' : undefined)
}

const restore = (file: MediaFile) => run(`restore:${file.id}`, () => $api(`${base.value}/${file.id}/restore`, { method: 'POST' }), file.slot === POSTER ? 'Poster put back' : 'Photo put back')

async function move(index: number, by: -1 | 1) {
  const ids = (data.value?.photos ?? []).map(p => p.id)
  const [moved] = ids.splice(index, 1)
  ids.splice(index + by, 0, moved!)
  await run('order', () => $api(`${base.value}/order`, { method: 'PUT', body: { fileIds: ids } }))
}

watch(data, (d) => {
  for (const f of [...(d?.waiting ?? []), ...(d?.photos ?? []), ...(d?.poster ? [d.poster] : [])]) descriptions[f.id] ??= f.altText ?? ''
}, { immediate: true })
const described = computed(() => [
  ...(data.value?.poster ? [{ file: data.value.poster, label: 'Poster' }] : []),
  ...(data.value?.photos ?? []).map((file, i) => ({ file, label: `Photo ${i + 1}` })),
])
const waitingLabel = (f: MediaFile) => f.slot === POSTER ? 'Use as the poster' : 'Add to the photos'
</script>

<template>
  <PageSection
    title="Poster and photos"
    description="Images shown on the production's public page. Each needs a description for people who cannot see it."
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      :skeleton-rows="3"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <RefusalNotice :refusal="refusal" />

        <div class="grid gap-6 md:grid-cols-[12rem_1fr]">
          <section aria-labelledby="poster-heading">
            <h3
              id="poster-heading"
              class="mb-2 text-sm font-semibold text-highlighted"
            >
              Poster
            </h3>
            <figure
              v-if="data.poster"
              class="space-y-2"
            >
              <img
                :src="data.poster.url!"
                :alt="data.poster.altText ?? ''"
                class="aspect-[2/3] w-full rounded-md border border-default object-cover"
              >
              <figcaption class="text-xs text-muted">
                {{ data.poster.altText }}
              </figcaption>
              <div class="flex flex-wrap gap-2">
                <UFileUpload
                  v-slot="{ open }"
                  :accept="ACCEPT"
                  :model-value="picked.poster"
                  :dropzone="false"
                  :interactive="false"
                  :preview="false"
                  @update:model-value="upload(POSTER, $event)"
                >
                  <UButton
                    label="Replace"
                    icon="i-lucide-upload"
                    color="neutral"
                    variant="outline"
                    :disabled="busy !== null"
                    @click="open()"
                  />
                </UFileUpload>
                <UButton
                  label="Remove"
                  color="neutral"
                  variant="ghost"
                  :disabled="busy !== null"
                  @click="remove(data.poster)"
                />
              </div>
            </figure>
            <UFileUpload
              v-else
              :accept="ACCEPT"
              label="Add a poster"
              description="PNG, JPEG or WebP"
              :model-value="picked.poster"
              :preview="false"
              :disabled="busy !== null"
              class="aspect-[2/3] w-full"
              @update:model-value="upload(POSTER, $event)"
            />
          </section>

          <section aria-labelledby="photos-heading">
            <h3
              id="photos-heading"
              class="mb-2 text-sm font-semibold text-highlighted"
            >
              Photos
            </h3>
            <ol
              v-if="data.photos.length"
              class="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              <li
                v-for="(photo, index) in data.photos"
                :key="photo.id"
                class="space-y-1"
              >
                <img
                  :src="photo.url!"
                  :alt="photo.altText ?? ''"
                  class="aspect-[3/2] w-full rounded-md border border-default object-cover"
                >
                <p class="line-clamp-2 text-xs text-muted">
                  {{ photo.altText }}
                </p>
                <div class="flex gap-1">
                  <IconButton
                    icon="i-lucide-arrow-left"
                    :label="`Move photo ${index + 1} earlier`"
                    size="xs"
                    :disabled="index === 0 || busy !== null"
                    @click="move(index, -1)"
                  />
                  <IconButton
                    icon="i-lucide-arrow-right"
                    :label="`Move photo ${index + 1} later`"
                    size="xs"
                    :disabled="index === data.photos.length - 1 || busy !== null"
                    @click="move(index, 1)"
                  />
                  <IconButton
                    icon="i-lucide-trash-2"
                    :label="`Remove photo ${index + 1}`"
                    size="xs"
                    :disabled="busy !== null"
                    @click="remove(photo)"
                  />
                </div>
              </li>
            </ol>
            <UFileUpload
              :accept="ACCEPT"
              multiple
              label="Add photos"
              description="PNG, JPEG or WebP. Choose several at once if you like."
              :model-value="picked.photos"
              :preview="false"
              :disabled="busy !== null"
              class="min-h-32 w-full"
              @update:model-value="upload(PHOTOS, $event)"
            />
          </section>
        </div>

        <section
          v-if="data.waiting.length"
          aria-labelledby="waiting-heading"
        >
          <h3
            id="waiting-heading"
            class="mb-2 text-sm font-semibold text-highlighted"
          >
            Uploaded, not yet in use
          </h3>
          <RecordList label="Uploaded, not yet in use">
            <RecordListItem
              v-for="file in data.waiting"
              :key="file.id"
              :icon="file.state === 'rejected' ? 'i-lucide-circle-x' : file.state === 'pending' ? 'i-lucide-loader-circle' : 'i-lucide-image'"
              :name="file.slot === POSTER ? 'A new poster' : 'A new photo'"
              :description="file.state === 'pending' ? 'Checking the image…' : file.state === 'rejected' ? (REFUSED[file.rejectedReason ?? ''] ?? 'This file was refused.') : 'Ready once it is described'"
            >
              <UButton
                :label="file.state === 'rejected' ? 'Dismiss' : 'Discard'"
                color="neutral"
                variant="ghost"
                :disabled="busy !== null"
                @click="remove(file)"
              />
              <template
                v-if="file.state === 'ready'"
                #below
              >
                <div class="flex flex-wrap items-start gap-4 px-4 pb-3">
                  <img
                    :src="file.url!"
                    alt=""
                    class="h-24 w-20 shrink-0 rounded border border-default object-cover"
                  >
                  <div class="min-w-0 flex-1 space-y-2">
                    <UFormField
                      :label="file.slot === POSTER ? 'Describe the poster' : 'Describe the photo'"
                      help="What someone who cannot see it needs to know."
                      required
                    >
                      <UInput
                        v-model="descriptions[file.id]"
                        :maxlength="300"
                        class="max-w-md"
                      />
                    </UFormField>
                    <UButton
                      :label="waitingLabel(file)"
                      :loading="busy === `use:${file.id}`"
                      :disabled="!descriptions[file.id]?.trim() || busy !== null"
                      @click="use(file)"
                    />
                  </div>
                </div>
              </template>
            </RecordListItem>
          </RecordList>
        </section>

        <section
          v-if="data.poster || data.photos.length"
          aria-labelledby="describe-heading"
        >
          <h3
            id="describe-heading"
            class="mb-2 text-sm font-semibold text-highlighted"
          >
            Descriptions
          </h3>
          <div class="space-y-3">
            <div
              v-for="item in described"
              :key="item.file.id"
              class="flex flex-wrap items-end gap-2"
            >
              <UFormField
                :label="item.label"
                class="min-w-0 flex-1"
              >
                <UInput
                  v-model="descriptions[item.file.id]"
                  :maxlength="300"
                  class="max-w-md"
                />
              </UFormField>
              <UButton
                :label="`Save ${item.label.toLowerCase()}'s description`"
                color="neutral"
                variant="outline"
                :disabled="!descriptions[item.file.id]?.trim() || descriptions[item.file.id]?.trim() === item.file.altText || busy !== null"
                @click="describe(item.file)"
              />
            </div>
          </div>
        </section>

        <UCollapsible
          v-if="data.removed.length"
          class="space-y-2"
        >
          <UButton
            :label="`Recently removed (${data.removed.length})`"
            color="neutral"
            variant="ghost"
            trailing-icon="i-lucide-chevron-down"
          />
          <template #content>
            <RecordList label="Recently removed">
              <RecordListItem
                v-for="file in data.removed"
                :key="file.id"
                icon="i-lucide-image-off"
                :name="`${file.slot === POSTER ? 'Poster' : 'Photo'}: ${file.altText ?? 'no description'}`"
                :description="`Can be put back until ${day(file.restorableUntil!)}`"
              >
                <UButton
                  label="Put back"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :disabled="busy !== null"
                  @click="restore(file)"
                />
              </RecordListItem>
            </RecordList>
          </template>
        </UCollapsible>
      </div>
    </DataBoundary>
  </PageSection>
</template>
