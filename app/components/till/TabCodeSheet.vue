<script setup lang="ts">
import { normaliseTabCode } from '#shared/utils/tab-presence'

// Somebody else's tab is charged only while they are there: their code from My NNT, scanned or
// typed (F-108 criterion 6, 0164). The till, not this sheet, sends the charge.
const open = defineModel<boolean>('open', { required: true })
const code = defineModel<string>('code', { required: true })

const props = defineProps<{ holderName: string, failure: string | null, loading: boolean }>()
const emit = defineEmits<{ charge: [] }>()

const scanning = ref(true)
const ready = computed(() => normaliseTabCode(code.value) !== null)

function decoded(value: string): void {
  code.value = value
  emit('charge')
}
</script>

<template>
  <NightSheet
    v-model:open="open"
    :title="`${props.holderName}'s tab code`"
    primary="Charge the tab"
    primary-test-id="confirm-tab-code"
    :primary-disabled="!ready"
    :loading="loading"
    @primary="emit('charge')"
  >
    <p
      class="text-sm text-muted"
      data-test="tab-code-ask"
    >
      Ask {{ props.holderName }} to open Bar tab in My NNT and show you tonight's tab code.
    </p>
    <QrScanner
      v-if="open && scanning"
      class="w-full"
      @decoded="decoded"
      @unavailable="scanning = false"
    />
    <UFormField label="Or type the code">
      <UInput
        v-model="code"
        data-test="tab-code-input"
        autocomplete="off"
        autocapitalize="characters"
        placeholder="ABCD-1234"
        class="w-full"
      />
    </UFormField>
    <UAlert
      v-if="failure"
      data-test="tab-code-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />
  </NightSheet>
</template>
