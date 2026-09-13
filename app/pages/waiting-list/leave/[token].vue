<script setup lang="ts">
// The one-click link every waiting-list email carries (D-113 criterion 4). A button, not an
// auto-action on load: an email scanner that opens the link must not remove anybody by itself.

const route = useRoute()
const token = computed(() => String(route.params.token))

const removing = ref(false)
const removed = ref(false)
const notice = ref<string | null>(null)

async function leave(): Promise<void> {
  notice.value = null
  removing.value = true
  try {
    await $fetch(`/api/waiting-list/${token.value}/remove`, { method: 'POST' })
    removed.value = true
  }
  catch {
    // The route refuses a forged, rotated or purged token alike, and cannot tell them apart:
    // one sentence covers all three without guessing which happened.
    notice.value = 'That link has already been used or is no longer valid.'
  }
  finally {
    removing.value = false
  }
}

useSeoMeta({ title: 'Leave the waiting list' })
</script>

<template>
  <UContainer
    class="max-w-2xl py-16"
    data-test="waiting-list-leave-page"
  >
    <h1 class="nnt-headline text-3xl">
      Leave the waiting list
    </h1>

    <div
      v-if="removed"
      class="mt-8"
      data-test="waiting-list-left"
    >
      <UAlert
        color="neutral"
        variant="subtle"
        description="You have left the waiting list."
      />
    </div>

    <div
      v-else
      class="mt-8 space-y-4"
    >
      <UAlert
        v-if="notice"
        color="error"
        variant="subtle"
        :description="notice"
        data-test="waiting-list-leave-notice"
      />

      <p class="text-muted">
        If you rejoin later you go to the back of the list, in the order you join.
      </p>
      <UButton
        color="error"
        variant="subtle"
        :loading="removing"
        data-test="waiting-list-leave-confirm"
        @click="leave"
      >
        Leave the waiting list
      </UButton>
    </div>
  </UContainer>
</template>
