<script setup lang="ts">
// The poster in the production page's side panel (C-23): seen beside every tab, and added, replaced,
// described and put to use from there without opening the Media tab. Photos and anything removed
// are on the Media tab.
import { IMAGE_TYPES, POSTER, REFUSED_IMAGE } from '../composables/useProductionMedia'

const props = defineProps<{ productionId: string }>()

const { data, refusal, busy, descriptions, upload: send, use, remove } = await useProductionMedia(props.productionId)

// Emptied after each choice, so choosing again never sends the earlier file twice.
const picked = ref<File | null>(null)
function upload(chosen: File | File[] | null | undefined) {
  picked.value = null
  return send(POSTER, chosen)
}
const waiting = computed(() => (data.value?.waiting ?? []).filter(f => f.slot === POSTER))
</script>

<template>
  <section
    v-if="data"
    aria-labelledby="side-poster-heading"
    class="mb-4 space-y-3 rounded-lg border border-default p-4"
  >
    <h2
      id="side-poster-heading"
      class="text-sm font-semibold text-highlighted"
    >
      Poster
    </h2>
    <RefusalNotice :refusal="refusal" />
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
    </figure>
    <div
      v-if="data.poster"
      class="flex flex-wrap gap-2"
    >
      <UFileUpload
        v-slot="{ open }"
        :accept="IMAGE_TYPES"
        :model-value="picked"
        :dropzone="false"
        :interactive="false"
        :preview="false"
        @update:model-value="upload"
      >
        <UButton
          label="Replace"
          icon="i-lucide-upload"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="busy !== null"
          @click="open()"
        />
      </UFileUpload>
      <UButton
        label="Remove"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="busy !== null"
        @click="remove(data.poster)"
      />
    </div>
    <UFileUpload
      v-else-if="!waiting.length"
      :accept="IMAGE_TYPES"
      label="Add a poster"
      description="PNG, JPEG or WebP"
      :model-value="picked"
      :preview="false"
      :disabled="busy !== null"
      class="aspect-[2/3] w-full"
      @update:model-value="upload"
    />

    <div
      v-for="file in waiting"
      :key="file.id"
      class="space-y-2 border-t border-default pt-3"
    >
      <p
        v-if="file.state === 'pending'"
        class="flex items-center gap-2 text-sm text-muted"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin"
        />
        Checking the new poster…
      </p>
      <template v-else-if="file.state === 'rejected'">
        <p class="text-sm">
          {{ REFUSED_IMAGE[file.rejectedReason ?? ''] ?? 'This file was refused.' }}
        </p>
        <UButton
          label="Dismiss"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="busy !== null"
          @click="remove(file)"
        />
      </template>
      <template v-else>
        <img
          :src="file.url!"
          alt=""
          class="aspect-[2/3] w-24 rounded border border-default object-cover"
        >
        <UFormField
          label="Describe the new poster"
          help="What someone who cannot see it needs to know."
          required
        >
          <UTextarea
            v-model="descriptions[file.id]"
            :rows="2"
            :maxlength="300"
          />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Use as the poster"
            size="sm"
            :loading="busy === `use:${file.id}`"
            :disabled="!descriptions[file.id]?.trim() || busy !== null"
            @click="use(file)"
          />
          <UButton
            label="Discard"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="busy !== null"
            @click="remove(file)"
          />
        </div>
      </template>
    </div>
  </section>
</template>
