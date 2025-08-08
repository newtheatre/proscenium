<template>
  <div>
    <ProfileCard
      v-if="user.data.value"
      :user="user.data.value"
    />

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
const { getMyProfile } = useProfile()
const user = await getMyProfile()

definePageMeta({
  middleware: ['auth'],
})
</script>

<style scoped>

</style>
