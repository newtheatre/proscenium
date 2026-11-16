<script setup lang="ts">
const route = useRoute()
const { data: page } = await useAsyncData(route.path, () => queryCollection('pages').path(route.path).first())
</script>
<template><ContentRenderer v-if="page" :value="page" /><h1 v-else>NOT FOUND</h1></template>
