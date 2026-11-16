<!-- A colour: a swatch that opens a picker, with the hex code beside it for someone who has one to
     paste. It takes and gives the code the server keeps ("#1d4ed8"). -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<string | null>({ default: '' })
const { t } = useT()
const HEX = /^#[0-9a-f]{6}$/i
const valid = computed(() => HEX.test(model.value ?? ''))
</script>

<template>
  <UFieldGroup>
    <UPopover :content="{ align: 'start' }">
      <UButton
        color="neutral"
        variant="outline"
        :disabled="disabled"
        :aria-label="t('core.colour.pick')"
      >
        <span
          class="size-5 rounded-sm border border-default"
          :style="{ backgroundColor: valid ? model! : 'transparent' }"
        />
      </UButton>
      <template #content>
        <UColorPicker
          :model-value="valid ? model! : undefined"
          class="p-2"
          @update:model-value="model = ($event as string | undefined) ?? ''"
        />
      </template>
    </UPopover>
    <UInput
      :model-value="model ?? ''"
      :disabled="disabled"
      maxlength="7"
      placeholder="#1d4ed8"
      class="w-32 font-mono"
      @update:model-value="model = String($event)"
    />
  </UFieldGroup>
</template>
