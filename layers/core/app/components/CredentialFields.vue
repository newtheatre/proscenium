<!-- Keys an administrator types into the app instead of the Cloudflare dashboard (Foundations,
     credentials; Matt, 17 November). A key is never shown again, but one that is set is obvious at a
     glance: its field is filled with dots between its provider's prefix and its last four characters
     (sk_live_••••••••4242), and says where the value comes from. Replace opens the field to type a
     new value, and Cancel keeps the one there. A saved key can be removed, and then a Worker secret
     of the same name, if there is one, is used again. The page that hosts the fields saves them. -->
<script setup lang="ts">
interface Item {
  name: string
  label: string
  help?: string
  /** Where the value comes from now: saved here, saved for the whole site, a Worker secret, or nowhere. */
  source: 'saved' | 'saved-for-module' | 'worker-secret' | null
  /** The last four characters of a long value. */
  hint?: string | null
  /** A long value's provider prefix, such as sk_live_. */
  start?: string | null
  /** Offers a button that fills the field with a random value, for a key nobody has to know. */
  generate?: boolean
}

const props = defineProps<{ items: Item[], disabled?: boolean }>()
const model = defineModel<Record<string, string>>({ required: true })
const emit = defineEmits<{ remove: [name: string] }>()
const { t } = useT()

const DOTS = '••••••••••••' // not-policy: how many dots stand for the hidden part
const masked = (item: Item) => `${item.start ?? ''}${DOTS}${item.hint ?? ''}`

// The keys whose field is open for a new value. A key not set is always open.
const replacing = ref<Set<string>>(new Set())
const open = (item: Item) => !item.source || replacing.value.has(item.name)
// Once the host saves, what it typed is cleared and the fields close again.
watch(() => props.items, () => { replacing.value = new Set() })

function replace(name: string) {
  replacing.value = new Set([...replacing.value, name])
}
function cancel(name: string) {
  replacing.value = new Set([...replacing.value].filter(n => n !== name))
  const { [name]: _, ...rest } = model.value
  model.value = rest
}

/** 32 random bytes as hex, typed into the field as if pasted; the person never has to see or keep it. */
function generate(name: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32)) // not-policy: 256 bits
  model.value = { ...model.value, [name]: [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') } // not-policy: hex digits
}

function state(item: Item): string {
  if (item.source === 'saved') return t('core.credentials.saved')
  if (item.source) return t(`core.credentials.${item.source}`)
  return t('core.credentials.not-set')
}
</script>

<template>
  <div class="space-y-4">
    <UFormField
      v-for="item in items"
      :key="item.name"
      :label="item.label"
      :help="item.help"
      :hint="state(item)"
    >
      <div class="flex flex-wrap gap-2">
        <UInput
          v-if="open(item)"
          :autofocus="replacing.has(item.name)"
          :model-value="model[item.name] ?? ''"
          type="password"
          autocomplete="new-password"
          spellcheck="false"
          class="min-w-48 flex-1"
          :disabled="disabled"
          :placeholder="item.source ? t('core.credentials.replace') : t('core.credentials.enter')"
          @update:model-value="value => model = { ...model, [item.name]: String(value) }"
        />
        <UInput
          v-else
          :model-value="masked(item)"
          readonly
          icon="i-lucide-lock-keyhole"
          class="min-w-48 flex-1"
          :ui="{ base: 'font-mono tracking-wide text-muted' }"
        />
        <UButton
          v-if="item.generate && open(item)"
          color="neutral"
          variant="outline"
          icon="i-lucide-wand-sparkles"
          :disabled="disabled"
          :label="t('core.credentials.generate')"
          @click="generate(item.name)"
        />
        <UButton
          v-if="item.source && !open(item)"
          color="neutral"
          variant="outline"
          icon="i-lucide-pencil"
          :disabled="disabled"
          :label="t('core.credentials.replace-action')"
          @click="replace(item.name)"
        />
        <UButton
          v-else-if="item.source"
          color="neutral"
          variant="ghost"
          :disabled="disabled"
          :label="t('core.credentials.cancel')"
          @click="cancel(item.name)"
        />
        <UButton
          v-if="item.source === 'saved'"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          :disabled="disabled"
          :label="t('core.credentials.remove')"
          @click="emit('remove', item.name)"
        />
      </div>
    </UFormField>
  </div>
</template>
