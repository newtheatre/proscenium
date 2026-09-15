<script setup lang="ts">
// Six hex characters after a hash (0032), typed or picked: the swatch opens the real picker, the
// input still takes a pasted brand colour directly, and undefined stays undefined.
const model = defineModel<string | undefined>()

defineProps<{ disabled?: boolean }>()

const HEX = /^#[0-9a-f]{6}$/i

const swatch = computed(() => (model.value && HEX.test(model.value) ? model.value : undefined))
</script>

<template>
  <div class="flex items-center gap-2">
    <UPopover>
      <UButton
        color="neutral"
        variant="outline"
        class="size-9 shrink-0 p-0"
        :style="swatch ? { backgroundColor: swatch } : undefined"
        :disabled="disabled"
        :aria-label="swatch ? `Colour ${swatch}` : 'Pick a colour'"
        data-test="colour-swatch"
      />
      <template #content>
        <UColorPicker
          :model-value="swatch ?? '#FFFFFF'"
          class="p-3"
          @update:model-value="model = $event"
        />
      </template>
    </UPopover>
    <UInput
      v-model="model"
      placeholder="Six characters after a hash"
      class="flex-1"
      :disabled="disabled"
      data-test="colour-hex"
    />
    <UButton
      v-if="model"
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-x"
      aria-label="Clear the colour"
      :disabled="disabled"
      data-test="colour-clear"
      @click="model = undefined"
    />
  </div>
</template>
