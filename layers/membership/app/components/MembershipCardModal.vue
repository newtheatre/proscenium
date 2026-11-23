<!-- The membership card (MEM-33, MEM-51), full screen: the holder's name, member number and the date
     it is valid until, with a code Box office signs each time it is opened. Without Box office it
     shows no code. Opened from My membership and from the members' area home. -->
<script setup lang="ts">
interface Shown { id: string, schemeName: string, endsOn: string | null }
const props = defineProps<{ membership: Shown | null, number?: string | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { day } = useDates()
const { viewer } = useViewer()

const doorCode = ref<string | null>(null)
watch(() => props.membership?.id, async (id) => {
  doorCode.value = null
  if (!id) return
  try {
    doorCode.value = (await $api<{ doorCode: string }>(`/api/box-office/door-codes/mem/${id}` as string)).doorCode
  }
  catch {
    // Box office is off, or the card is no longer offered: the card is shown without a code.
  }
}, { immediate: true })
</script>

<template>
  <UModal
    :open="!!membership"
    fullscreen
    :title="membership?.schemeName ?? ''"
    @update:open="v => { if (!v) emit('close') }"
  >
    <template #body>
      <div
        v-if="membership"
        class="mx-auto flex max-w-sm flex-col items-center gap-4 text-center"
      >
        <p
          v-if="viewer.name"
          class="text-2xl font-semibold"
        >
          {{ viewer.name }}
        </p>
        <FactStrip
          centred
          :facts="[
            ...(number ? [{ label: t('membership.screens.mine.number'), value: number }] : []),
            { label: t('membership.screens.mine.valid-until'), value: membership.endsOn ? day(membership.endsOn) : t('membership.screens.mine.no-end') },
          ]"
        />
        <QrCode
          v-if="doorCode"
          :value="doorCode"
          :label="t('membership.screens.mine.card-code')"
          class="w-72!"
        />
        <p class="text-sm text-muted">
          {{ t(doorCode ? 'core.card.show' : 'core.card.show-no-code') }}
        </p>
      </div>
    </template>
  </UModal>
</template>
