<!-- How a brand looks before it is saved (C-35): the theatre's pages in light and dark and an email,
     drawn from the tokens POST /api/core/branding/preview makes for the choice as edited. The tokens
     come from the same place as the saved brand's, so what is shown is what will be saved. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import type { BrandLogo } from '../composables/useBrand'

interface ModeTokens { background: string, surface: string, border: string, text: string, muted: string, link: string, solid: string, onSolid: string }
interface Preview { tokens: { light: ModeTokens, dark: ModeTokens, radius: string, displayFont: string }, email: { subject: string, html: string } }

const props = defineProps<{
  accent: string
  neutral: string
  displayFont: string
  radius: string
  name: string
  logo: BrandLogo | null
  logoDark: BrandLogo | null
}>()

const { $api } = useNuxtApp()
const preview = ref<Preview | null>(null)
const failed = ref(false)
const HEX = /^#[0-9a-f]{6}$/i

async function load() {
  // A colour still being typed is not a colour yet: keep the last preview until it is.
  if (!HEX.test(props.accent)) return
  try {
    preview.value = await $api<Preview>('/api/core/branding/preview', {
      method: 'POST',
      body: { accent: props.accent, neutral: props.neutral, displayFont: props.displayFont, radius: props.radius },
    })
    failed.value = false
  }
  catch {
    failed.value = true
  }
}
onMounted(load)
watchDebounced(() => [props.accent, props.neutral, props.displayFont, props.radius], load, { debounce: 300 }) // not-policy: wait for typing to pause

const modes = computed(() => {
  const p = preview.value
  if (!p) return []
  return [
    { id: 'light', label: 'Light', tokens: p.tokens.light, logo: props.logo },
    { id: 'dark', label: 'Dark', tokens: p.tokens.dark, logo: props.logoDark ?? props.logo },
  ]
})
</script>

<template>
  <div
    class="space-y-4"
    aria-live="polite"
  >
    <UAlert
      v-if="failed"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      description="The preview could not be drawn just now. Saving still works."
    />
    <USkeleton
      v-if="!preview && !failed"
      class="h-48 w-full"
    />
    <div
      v-if="preview"
      class="grid gap-4 sm:grid-cols-2"
    >
      <figure
        v-for="mode in modes"
        :key="mode.id"
        class="space-y-1"
      >
        <figcaption class="text-sm text-muted">
          {{ mode.label }}
        </figcaption>
        <div
          class="space-y-3 border p-4 text-sm"
          :style="{ background: mode.tokens.background, color: mode.tokens.text, borderColor: mode.tokens.border, borderRadius: preview.tokens.radius }"
        >
          <div
            class="flex items-center gap-2 border-b pb-2"
            :style="{ borderColor: mode.tokens.border }"
          >
            <img
              v-if="mode.logo"
              :src="mode.logo.url"
              :alt="mode.logo.alt"
              class="max-h-8 max-w-32 object-contain"
            >
            <span
              v-else
              class="font-semibold"
              :style="{ fontFamily: preview.tokens.displayFont }"
            >{{ name }}</span>
          </div>
          <p
            class="text-lg font-semibold"
            :style="{ fontFamily: preview.tokens.displayFont }"
          >
            What's on
          </p>
          <div
            class="space-y-1 border p-3"
            :style="{ background: mode.tokens.surface, borderColor: mode.tokens.border, borderRadius: preview.tokens.radius }"
          >
            <p class="font-medium">
              An evening performance
            </p>
            <p :style="{ color: mode.tokens.muted }">
              Doors open half an hour before.
            </p>
            <span
              class="underline"
              :style="{ color: mode.tokens.link }"
            >More about the show</span>
          </div>
          <span
            class="inline-block px-3 py-1.5 font-medium"
            :style="{ background: mode.tokens.solid, color: mode.tokens.onSolid, borderRadius: preview.tokens.radius }"
          >Book tickets</span>
        </div>
      </figure>
    </div>
    <figure
      v-if="preview"
      class="space-y-1"
    >
      <figcaption class="text-sm text-muted">
        An email: {{ preview.email.subject }}
      </figcaption>
      <!-- Email is always white, whatever the screen's mode, so the preview is too. Sandboxed: nothing in it runs. -->
      <iframe
        :srcdoc="preview.email.html"
        sandbox=""
        title="Email preview"
        class="h-64 w-full rounded-md border border-default bg-white"
      />
    </figure>
  </div>
</template>
