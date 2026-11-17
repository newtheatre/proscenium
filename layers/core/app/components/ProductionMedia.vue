<script setup lang="ts">
// A production's poster and photos (C-23, C-24): everything on the production page's Media tab. The
// poster can also be changed from the page's side panel (ProductionPoster); both share one source.
// A new poster replaces the old in one step, and anything taken off can be put back while its
// restore period lasts.
import { IMAGE_TYPES as ACCEPT, PHOTOS, POSTER, REFUSED_IMAGE as REFUSED, type MediaFile } from '../composables/useProductionMedia'

const props = defineProps<{ productionId: string }>()

const { day } = useDates()
const { data, status, error, refresh, refusal, busy, descriptions, upload: send, use, describe, remove, restore, move } = await useProductionMedia(props.productionId)

// The pickers hold nothing between choices: each choice is uploaded at once and the picker emptied,
// so choosing again never sends the earlier files twice.
const picked = reactive<{ poster: File | null, photos: File[] }>({ poster: null, photos: [] })
function upload(slot: string, chosen: File | File[] | null | undefined) {
  picked.poster = null
  picked.photos = []
  return send(slot, chosen)
}

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
