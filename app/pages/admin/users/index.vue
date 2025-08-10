<template>
  <div>
    <pre>{{ data }}</pre>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
  middleware: ['admin'],
})

const { data } = await useFetch('/api/users', {
  method: 'GET',
  query: {
    page: 1,
    limit: 2,
    filter: 'roles',
    search: 'TRAINER',
  },
})
</script>

<style scoped>

</style>
