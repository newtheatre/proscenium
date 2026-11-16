<!-- Confirm it is you, reached by address rather than from an action (ID-28). Screens confirm in
     place through the dialogue; this page opens the same dialogue and then goes on to `next`. -->
<script setup lang="ts">
useSeoMeta({ title: 'Confirm it is you' })
const { t } = useT()
const route = useRoute()
const next = nextPath(route.query.next) ?? '/'
const { confirmItsYou } = useConfirmItsYou()

async function confirm() {
  if (await confirmItsYou()) await navigateTo(next)
}
onMounted(confirm)
</script>

<template>
  <IdentityCard
    :title="t('core.confirm-its-you.title')"
    :description="t('core.confirm-its-you.description')"
  >
    <UButton
      block
      icon="i-lucide-shield-check"
      :label="t('core.confirm-its-you.title')"
      @click="confirm"
    />
  </IdentityCard>
</template>
