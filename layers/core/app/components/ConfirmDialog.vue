<!-- The one confirmation dialog, mounted once in app.vue and opened by useConfirm(). -->
<script setup lang="ts">
const { pending, answer } = useConfirm()
const { t } = useT()
const open = computed({
  get: () => pending.value !== null,
  set: (value: boolean) => { if (!value) answer(false) },
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="pending ? t('core.confirm.title', { verb: pending.verb, thing: pending.thing }) : ''"
    :description="pending?.consequence"
    :dismissible="true"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :label="t('core.confirm.keep')"
          @click="answer(false)"
        />
        <UButton
          color="error"
          :label="pending?.button ?? pending?.verb"
          @click="answer(true)"
        />
      </div>
    </template>
  </UModal>
</template>
