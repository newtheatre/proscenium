<!-- One of the brand's logos on the Branding screen (C-35, C-36): the logo in use with its
     description, and a new one uploaded, checked in the background, described and put to use. A
     public image is never used without a description. Putting a logo to use, or removing it, saves
     the brand through PUT /api/core/branding, which raises its revision so browsers fetch it again. -->
<script setup lang="ts">
import { useTimeoutFn } from '@vueuse/core'
import type { BrandLogo } from '../composables/useBrand'

const props = defineProps<{
  /** Which logo: the brand's field and the file slot it is uploaded into. */
  field: 'logo' | 'logoDark'
  label: string
  help: string
  current: BrandLogo | null
  disabled?: boolean
  /** Draws the logo on a dark ground, as it will be seen. */
  dark?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

interface Upload { id: string, state: 'pending' | 'ready' | 'rejected' | 'deleted', url: string | null, rejectedReason: string | null, altText: string | null }

const LOGO_TYPES = 'image/png,image/jpeg,image/webp,image/svg+xml'
const REFUSED: Record<string, string> = {
  'type-not-accepted': 'This is not a PNG, JPEG, WebP or SVG image.',
  'too-large': 'This logo is larger than the theatre allows.',
  'damaged': 'This image could not be read.',
  'upload-timeout': 'This upload did not finish in time.',
}

const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const slot = computed(() => props.field === 'logo' ? 'core.brand-logo' : 'core.brand-logo-dark')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref<'upload' | 'use' | 'remove' | 'describe' | null>(null)
const upload = ref<Upload | null>(null)
const description = ref('')
/** The new logo was put to use without a description. */
const undescribed = ref(false)
const currentDescription = ref(props.current?.alt ?? '')
watch(() => props.current?.alt, alt => (currentDescription.value = alt ?? ''))
// Emptied after each choice, so choosing again never sends the earlier file twice.
const picked = ref<File | null>(null)

// While the new logo is being checked, look again shortly.
const { start: lookAgain } = useTimeoutFn(async () => {
  if (!upload.value || upload.value.state !== 'pending') return
  try {
    upload.value = await $api<Upload>(`/api/core/files/${upload.value.id}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return
  }
  if (upload.value.state === 'pending') lookAgain()
}, 1500, { immediate: false }) // not-policy: how soon to look at a file being checked

async function run(kind: NonNullable<typeof busy.value>, fn: () => Promise<unknown>) {
  refusal.value = null
  busy.value = kind
  try {
    await fn()
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

async function send(chosen: File | File[] | null | undefined) {
  picked.value = null
  const file = [chosen ?? []].flat()[0]
  if (!file) return
  await run('upload', async () => {
    const made = await $api<{ id: string }>('/api/core/files', { method: 'POST', query: { slot: slot.value, owner: 'site', name: file.name }, body: file, headers: { 'content-type': file.type || 'application/octet-stream' } })
    upload.value = { id: made.id, state: 'pending', url: null, rejectedReason: null, altText: null }
    description.value = ''
    undescribed.value = false
    lookAgain()
  })
}

async function use() {
  const file = upload.value
  if (!file) return
  const text = description.value.trim()
  undescribed.value = !text
  if (!text) return
  const done = await run('use', async () => {
    if (text !== (file.altText ?? '')) await $api(`/api/core/files/${file.id}`, { method: 'PATCH', body: { altText: text } })
    await $api('/api/core/branding', { method: 'PUT', body: { [props.field]: file.id } })
  })
  if (!done) return
  upload.value = null
  toast.add({ title: props.current ? `${props.label} replaced` : `${props.label} added`, color: 'success', icon: 'i-lucide-circle-check' })
  emit('changed')
}

function discard() {
  upload.value = null
  description.value = ''
  undescribed.value = false
  refusal.value = null
}

async function describeCurrent() {
  const text = currentDescription.value.trim()
  const file = props.current
  if (!file || !text || text === file.alt) return
  const id = file.url.split('/').pop()!
  const done = await run('describe', () => $api(`/api/core/files/${id}`, { method: 'PATCH', body: { altText: text } }))
  if (!done) return
  toast.add({ title: 'Description saved', color: 'success', icon: 'i-lucide-circle-check' })
  emit('changed')
}

async function remove() {
  if (!await confirm({
    verb: 'Remove',
    thing: props.field === 'logo' ? 'the logo' : 'the logo for dark mode',
    consequence: props.field === 'logo'
      ? 'The theatre\'s name is shown in its place, in the site\'s header, on emails and on PDFs.'
      : 'The main logo is shown on dark backgrounds instead.',
    button: 'Remove logo',
  })) return
  const done = await run('remove', () => $api('/api/core/branding', { method: 'PUT', body: { [props.field]: null } }))
  if (!done) return
  toast.add({ title: `${props.label} removed`, color: 'success', icon: 'i-lucide-circle-check' })
  emit('changed')
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <p class="text-sm font-medium text-highlighted">
        {{ label }}
      </p>
      <p class="text-sm text-muted">
        {{ help }}
      </p>
    </div>
    <RefusalNotice :refusal="refusal" />

    <template v-if="current">
      <figure
        class="flex h-28 items-center justify-center rounded-md border border-default p-4"
        :class="dark ? 'bg-neutral-900' : 'bg-white'"
      >
        <img
          :src="current.url"
          :alt="current.alt"
          class="max-h-20 max-w-full object-contain"
        >
      </figure>
      <UFormField
        label="Description"
        help="What someone who cannot see the logo needs to know, usually the theatre's name."
        :name="`${field}-alt`"
      >
        <div class="flex flex-wrap items-start gap-2">
          <UInput
            v-model="currentDescription"
            :maxlength="300"
            :disabled="disabled"
            class="max-w-md flex-1"
          />
          <UButton
            v-if="currentDescription.trim() && currentDescription.trim() !== current.alt"
            label="Save description"
            color="neutral"
            variant="outline"
            :loading="busy === 'describe'"
            :disabled="disabled || busy !== null"
            @click="describeCurrent()"
          />
        </div>
      </UFormField>
    </template>

    <div
      v-if="upload"
      class="space-y-3 rounded-md border border-default p-3"
    >
      <p
        v-if="upload.state === 'pending'"
        class="flex items-center gap-2 text-sm text-muted"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin"
        />
        Checking the new logo…
      </p>
      <template v-else-if="upload.state === 'rejected' || upload.state === 'deleted'">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="REFUSED[upload.rejectedReason ?? ''] ?? 'This file was refused.'"
        />
        <UButton
          label="Dismiss"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="discard()"
        />
      </template>
      <template v-else>
        <figure
          class="flex h-28 items-center justify-center rounded-md border border-default p-4"
          :class="dark ? 'bg-neutral-900' : 'bg-white'"
        >
          <img
            :src="upload.url!"
            alt=""
            class="max-h-20 max-w-full object-contain"
          >
        </figure>
        <UFormField
          label="Describe the new logo"
          help="What someone who cannot see it needs to know, usually the theatre's name."
          :name="`${field}-new-alt`"
          :error="undescribed ? 'Describe the logo, for people who cannot see it.' : undefined"
          required
        >
          <UInput
            v-model="description"
            :maxlength="300"
            class="max-w-md"
          />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            :label="field === 'logo' ? 'Use as the logo' : 'Use for dark mode'"
            :loading="busy === 'use'"
            :disabled="busy !== null"
            @click="use()"
          />
          <UButton
            label="Discard"
            color="neutral"
            variant="ghost"
            :disabled="busy !== null"
            @click="discard()"
          />
        </div>
      </template>
    </div>

    <div
      v-if="!disabled"
      class="flex flex-wrap gap-2"
    >
      <UFileUpload
        v-slot="{ open }"
        :accept="LOGO_TYPES"
        :model-value="picked"
        :dropzone="false"
        :interactive="false"
        :preview="false"
        @update:model-value="send"
      >
        <UButton
          :label="current ? 'Replace' : 'Upload a logo'"
          icon="i-lucide-upload"
          color="neutral"
          variant="outline"
          :loading="busy === 'upload'"
          :disabled="busy !== null || upload?.state === 'pending'"
          @click="open()"
        />
      </UFileUpload>
      <UButton
        v-if="current"
        label="Remove"
        color="neutral"
        variant="ghost"
        :loading="busy === 'remove'"
        :disabled="busy !== null"
        @click="remove()"
      />
    </div>
    <p
      v-if="!disabled && !current && !upload"
      class="text-xs text-muted"
    >
      PNG, JPEG, WebP or SVG. It is checked and cleaned before it is used.
    </p>
  </div>
</template>
