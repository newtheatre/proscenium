<script setup lang="ts">
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '#shared/utils/programme'
import type { AdminShow } from '#shared/utils/programme'

// The show's artwork (D-132 criterion 6). The preview is `PosterFrame`, the same component the
// public site draws, so the card cannot show the reader a poster the site would not.

const props = defineProps<{ show: AdminShow }>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const busy = ref(false)
const failure = ref<string | null>(null)
const removing = ref(false)
const picked = ref<File | null>(null)

const accept = IMAGE_TYPES.join(',')
const limit = `${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB`

async function send(file: File): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const body = new FormData()
    body.append('poster', file)
    await $fetch(`/api/admin/shows/${props.show.id}/poster`, { method: 'POST', body })
    toast.add({ title: 'Poster saved', icon: 'i-lucide-check', color: 'success' })
    emit('changed')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
    picked.value = null
  }
}

watch(picked, (file) => {
  if (file) void send(file)
})

async function remove(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/shows/${props.show.id}/poster`, { method: 'DELETE' })
    toast.add({ title: 'Poster removed', icon: 'i-lucide-check', color: 'success' })
    removing.value = false
    emit('changed')
  }
  catch (refused) {
    failure.value = refusalText(refused)
    removing.value = false
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard data-test="poster-card">
    <template #header>
      <h3 class="font-semibold">
        Poster
      </h3>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="failure"
        data-test="poster-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <div class="max-w-56">
        <PosterFrame
          :title="show.title"
          :slug="show.slug"
          :poster-url="show.posterUrl"
          :titled="show.posterUrl === null"
          sizes="xs:80vw sm:40vw md:30vw lg:20vw"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UFileUpload
          v-model="picked"
          variant="button"
          :accept="accept"
          :preview="false"
          :disabled="busy"
          data-test="poster-upload"
        >
          <template #default="{ open }">
            <UButton
              icon="i-lucide-upload"
              :loading="busy"
              :label="show.posterUrl ? 'Replace' : 'Upload a poster'"
              @click="open()"
            />
          </template>
        </UFileUpload>
        <UButton
          v-if="show.posterUrl"
          color="neutral"
          variant="ghost"
          :disabled="busy"
          data-test="poster-remove"
          @click="removing = true"
        >
          Remove
        </UButton>
      </div>

      <p class="text-sm text-muted">
        Show art is sovereign: no house styling is applied to it, ever. JPEG, PNG or WebP, up to {{ limit }}.
      </p>
    </div>

    <UModal
      v-model:open="removing"
      title="Remove this poster"
      description="The listing and the show page go back to the show's own gradient until another is uploaded."
    >
      <template #footer>
        <UButton
          color="error"
          :loading="busy"
          data-test="confirm-poster-remove"
          @click="remove"
        >
          Remove it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removing = false"
        >
          Keep it
        </UButton>
      </template>
    </UModal>
  </UCard>
</template>
