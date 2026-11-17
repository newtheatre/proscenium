<!-- Keys an administrator types into the app instead of the Cloudflare dashboard (Foundations,
     credentials; Matt, 17 November). A saved key is never shown again: each field says where its
     value comes from, with the last four characters of a saved one, and is left blank to keep it.
     Typing replaces it. A saved key can be removed, and then a Worker secret of the same name, if
     there is one, is used again. The page that hosts the fields saves them. -->
<script setup lang="ts">
interface Item {
  name: string
  label: string
  help?: string
  /** Where the value comes from now: saved here, saved for the whole site, a Worker secret, or nowhere. */
  source: 'saved' | 'saved-for-module' | 'worker-secret' | null
  hint?: string | null
}

defineProps<{ items: Item[], disabled?: boolean }>()
const model = defineModel<Record<string, string>>({ required: true })
const emit = defineEmits<{ remove: [name: string] }>()
const { t } = useT()

function state(item: Item): string {
  if (item.source === 'saved') return item.hint ? t('core.credentials.saved-ending', { hint: item.hint }) : t('core.credentials.saved')
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
      <div class="flex gap-2">
        <UInput
          :model-value="model[item.name] ?? ''"
          type="password"
          autocomplete="new-password"
          spellcheck="false"
          class="flex-1"
          :disabled="disabled"
          :placeholder="item.source ? t('core.credentials.replace') : t('core.credentials.enter')"
          @update:model-value="value => model = { ...model, [item.name]: String(value) }"
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
