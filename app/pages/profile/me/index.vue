<template>
  <div>
    <ProfileCard
      v-if="user.data.value?.data?.user"
      :user="user.data.value.data.user"
    />

    <UIAlert
      v-else-if="user.error.value"
      type="error"
    >
      {{ user.error.value.statusMessage || 'Failed to load profile' }}
    </UIAlert>

    <div
      v-else-if="user.pending.value"
      class="loading"
    >
      <LoadingSpinner />
    </div>

    <UIAlert
      v-else
      type="error"
    >
      <!-- In theory this should never be displayed -->
      You are not logged in
    </UIAlert>
  </div>
</template>

<script lang="ts" setup>
const user = await useFetch<UserResponse>('/api/users/me')

definePageMeta({
  middleware: ['auth'],
})
</script>

<style scoped>
.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}
</style>
